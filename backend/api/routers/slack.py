import os
import re
import secrets
import sys
import time
from typing import Any, Dict, List
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
try:
    from slack_sdk import WebClient
    from slack_sdk.errors import SlackApiError
except Exception:  # pragma: no cover - handled at runtime when SDK is missing
    WebClient = None

    class SlackApiError(Exception):
        pass

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(PROJECT_ROOT)
sys.path.append(os.path.join(PROJECT_ROOT, "Noise filter module"))

from brd_module.storage import store_chunks
from classifier import classify_chunks
from schema import ClassifiedChunk, SignalLabel

router = APIRouter(prefix="/integrations/slack", tags=["Slack Integration"])

SLACK_SCOPES = ",".join(
    [
        "channels:read",
        "channels:join",
        "groups:read",
        "channels:history",
        "groups:history",
        "users:read",
    ]
)
OAUTH_STATE_TTL_SECONDS = 10 * 60

_oauth_states: Dict[str, float] = {}
_slack_auth_state: Dict[str, Any] = {
    "access_token": None,
    "team_id": None,
    "team_name": None,
    "scopes": [],
}


class SlackIngestRequest(BaseModel):
    session_id: str
    channel_ids: List[str] = Field(default_factory=list)
    limit_per_channel: int = Field(default=200, ge=1, le=1000)


def _clean_stale_states() -> None:
    now = time.time()
    stale = [key for key, created in _oauth_states.items() if now - created > OAUTH_STATE_TTL_SECONDS]
    for key in stale:
        _oauth_states.pop(key, None)


def _get_redirect_uri() -> str:
    redirect_uri = os.getenv("SLACK_REDIRECT_URI")
    if redirect_uri:
        normalized = redirect_uri.strip().rstrip("/")
        # Auto-migrate stale legacy callback paths to the active API callback route.
        if normalized.endswith("/slack/oauth_redirect"):
            backend_public_url = os.getenv("BACKEND_PUBLIC_URL", "http://localhost:8000").rstrip("/")
            return f"{backend_public_url}/integrations/slack/auth/callback"
        return normalized
    backend_public_url = os.getenv("BACKEND_PUBLIC_URL", "http://localhost:8000").rstrip("/")
    return f"{backend_public_url}/integrations/slack/auth/callback"


def _get_frontend_profile_url() -> str:
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return f"{frontend_url}/profile"


def _strip_slack_formatting(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"<@U[A-Z0-9]+>", "", text)
    text = re.sub(r"<#[A-Z0-9]+\|([^>]+)>", r"\1", text)
    text = re.sub(r"<#[A-Z0-9]+>", "", text)
    text = re.sub(r"<![a-z]+>", "", text)
    text = re.sub(r"<https?://[^|> ]+\|([^>]+)>", r"\1", text)
    text = re.sub(r"<https?://[^> ]+>", "", text)
    text = re.sub(r"https?://\S+|www\.\S+", "", text)
    text = text.replace("\n", " ").replace("\r", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _require_config() -> tuple[str, str, str]:
    client_id = os.getenv("SLACK_CLIENT_ID")
    client_secret = os.getenv("SLACK_CLIENT_SECRET")
    redirect_uri = _get_redirect_uri()
    if not client_id or not client_secret:
        missing = []
        if not client_id:
            missing.append("SLACK_CLIENT_ID")
        if not client_secret:
            missing.append("SLACK_CLIENT_SECRET")
        raise HTTPException(
            status_code=503,
            detail=f"Slack OAuth is not configured. Missing: {', '.join(missing)}.",
        )
    return client_id, client_secret, redirect_uri


def _require_slack_sdk() -> None:
    if WebClient is None:
        raise HTTPException(
            status_code=500,
            detail="slack-sdk is not installed on this backend runtime.",
        )


def _require_token() -> str:
    token = _slack_auth_state.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Slack is not connected. Run OAuth first.")
    return str(token)


@router.get("/auth/start")
def start_slack_oauth(redirect: bool = Query(default=False)):
    client_id, _, redirect_uri = _require_config()
    _clean_stale_states()
    state = secrets.token_urlsafe(24)
    _oauth_states[state] = time.time()
    auth_url = (
        "https://slack.com/oauth/v2/authorize"
        f"?client_id={client_id}"
        f"&scope={SLACK_SCOPES}"
        f"&redirect_uri={quote(redirect_uri, safe='')}"
        f"&state={quote(state, safe='')}"
    )
    if redirect:
        return RedirectResponse(auth_url)
    return {"auth_url": auth_url, "state": state}


@router.get("/auth/callback")
def slack_oauth_callback(code: str = Query(default=""), state: str = Query(default="")):
    frontend_profile = _get_frontend_profile_url()
    if not code or not state:
        return RedirectResponse(f"{frontend_profile}?slack=error&reason=missing_code_or_state")

    _clean_stale_states()
    if state not in _oauth_states:
        return RedirectResponse(f"{frontend_profile}?slack=error&reason=invalid_state")

    _oauth_states.pop(state, None)
    _require_slack_sdk()
    client_id, client_secret, redirect_uri = _require_config()
    client = WebClient()
    try:
        response = client.oauth_v2_access(
            client_id=client_id,
            client_secret=client_secret,
            code=code,
            redirect_uri=redirect_uri,
        )
    except SlackApiError as exc:
        message = quote(str(exc), safe="")
        return RedirectResponse(f"{frontend_profile}?slack=error&reason={message}")

    token = response.get("access_token")
    team = response.get("team", {}) or {}
    scopes = (response.get("scope") or "").split(",")
    _slack_auth_state.update(
        {
            "access_token": token,
            "team_id": team.get("id"),
            "team_name": team.get("name"),
            "scopes": [scope for scope in scopes if scope],
        }
    )
    team_name = quote(str(team.get("name") or "workspace"), safe="")
    return RedirectResponse(f"{frontend_profile}?slack=connected&team={team_name}")


@router.get("/status")
def slack_status():
    connected = bool(_slack_auth_state.get("access_token"))
    return {
        "connected": connected,
        "team_id": _slack_auth_state.get("team_id"),
        "team_name": _slack_auth_state.get("team_name"),
        "scopes": _slack_auth_state.get("scopes") or [],
    }


@router.post("/disconnect")
def slack_disconnect():
    _slack_auth_state.update(
        {
            "access_token": None,
            "team_id": None,
            "team_name": None,
            "scopes": [],
        }
    )
    return {"message": "Slack disconnected."}


@router.get("/channels")
def list_slack_channels():
    token = _require_token()
    _require_slack_sdk()
    client = WebClient(token=token)

    channels: List[dict] = []
    cursor = None
    try:
        while True:
            response = client.conversations_list(
                types="public_channel,private_channel",
                limit=200,
                cursor=cursor,
                exclude_archived=True,
            )
            channels.extend(
                {
                    "id": ch.get("id"),
                    "name": ch.get("name"),
                    "is_member": ch.get("is_member", False),
                }
                for ch in response.get("channels", [])
                if ch.get("id") and ch.get("name")
            )
            cursor = response.get("response_metadata", {}).get("next_cursor")
            if not cursor:
                break
    except SlackApiError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list Slack channels: {exc}") from exc

    channels.sort(key=lambda c: c["name"])
    return {"count": len(channels), "channels": channels}


@router.post("/ingest")
def ingest_slack_channels(body: SlackIngestRequest):
    token = _require_token()
    _require_slack_sdk()
    if not body.channel_ids:
        raise HTTPException(status_code=400, detail="Select at least one Slack channel to ingest.")

    client = WebClient(token=token)
    user_cache: Dict[str, str] = {}
    chunk_dicts: List[dict] = []
    per_channel_counts: Dict[str, int] = {}
    inaccessible_channels: List[Dict[str, str]] = []

    try:
        for channel_id in body.channel_ids:
            fetched_for_channel = 0
            cursor = None
            attempted_join = False
            while fetched_for_channel < body.limit_per_channel:
                remaining = body.limit_per_channel - fetched_for_channel
                try:
                    response = client.conversations_history(
                        channel=channel_id,
                        limit=min(200, remaining),
                        cursor=cursor,
                    )
                except SlackApiError as exc:
                    slack_error = str((getattr(exc, "response", None) or {}).get("error", ""))
                    if slack_error == "not_in_channel" and not attempted_join:
                        is_private = False
                        try:
                            info = client.conversations_info(channel=channel_id)
                            is_private = bool((info.get("channel") or {}).get("is_private"))
                        except SlackApiError:
                            # If metadata lookup fails, try a join once for public channels.
                            is_private = False

                        if is_private:
                            inaccessible_channels.append(
                                {
                                    "channel_id": channel_id,
                                    "reason": "Bot is not a member of this private channel.",
                                }
                            )
                            break

                        try:
                            client.conversations_join(channel=channel_id)
                            attempted_join = True
                            continue
                        except SlackApiError as join_exc:
                            join_error = str((getattr(join_exc, "response", None) or {}).get("error", "unknown"))
                            inaccessible_channels.append(
                                {
                                    "channel_id": channel_id,
                                    "reason": f"Unable to join channel automatically ({join_error}).",
                                }
                            )
                            break
                    raise
                messages = response.get("messages", [])
                if not messages:
                    break

                for msg in messages:
                    text = _strip_slack_formatting(msg.get("text", ""))
                    if len(text) < 15:
                        continue
                    user_id = msg.get("user")
                    if user_id and user_id not in user_cache:
                        try:
                            user_info = client.users_info(user=user_id)
                            profile = user_info.get("user", {}).get("profile", {})
                            user_cache[user_id] = (
                                profile.get("real_name")
                                or profile.get("display_name")
                                or user_id
                            )
                        except SlackApiError:
                            user_cache[user_id] = user_id

                    speaker = user_cache.get(user_id, "Unknown")
                    source_ref = f"slack:{channel_id}:{msg.get('ts', '')}"
                    chunk_dicts.append(
                        {
                            "cleaned_text": text[:1500],
                            "source_ref": source_ref,
                            "speaker": speaker,
                            "source_type": "slack",
                        }
                    )
                    fetched_for_channel += 1
                    if fetched_for_channel >= body.limit_per_channel:
                        break

                cursor = response.get("response_metadata", {}).get("next_cursor")
                if not cursor:
                    break

            per_channel_counts[channel_id] = fetched_for_channel
    except SlackApiError as exc:
        raise HTTPException(status_code=500, detail=f"Slack ingestion failed: {exc}") from exc

    if not chunk_dicts:
        detail = "No usable Slack messages found in selected channels."
        if inaccessible_channels:
            detail = f"{detail} Inaccessible channels: {inaccessible_channels}"
        raise HTTPException(status_code=400, detail=detail)

    try:
        api_key = os.environ.get("GROQ_CLOUD_API")
        classified = classify_chunks(chunk_dicts, api_key=api_key)
    except Exception:
        classified = []
        for raw in chunk_dicts:
            text = (raw.get("cleaned_text") or "").strip()
            lower = text.lower()
            label = SignalLabel.REQUIREMENT if any(k in lower for k in ["must", "should", "need", "requirement"]) else SignalLabel.NOISE
            classified.append(
                ClassifiedChunk(
                    session_id=body.session_id,
                    source_type="slack",
                    source_ref=raw.get("source_ref", "unknown"),
                    speaker=raw.get("speaker", "Unknown"),
                    raw_text=text,
                    cleaned_text=text,
                    label=label,
                    confidence=0.6,
                    reasoning="Fallback local classification (LLM unavailable).",
                    flagged_for_review=True,
                )
            )

    for chunk in classified:
        chunk.session_id = body.session_id
    store_chunks(classified)

    return {
        "message": f"Ingested {len(chunk_dicts)} Slack messages from {len(body.channel_ids)} channel(s).",
        "session_id": body.session_id,
        "selected_channels": body.channel_ids,
        "channel_message_counts": per_channel_counts,
        "inaccessible_channels": inaccessible_channels,
        "chunk_count": len(classified),
    }
