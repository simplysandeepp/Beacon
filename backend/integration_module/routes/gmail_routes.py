import os
import sys
from typing import List

from fastapi import APIRouter, Request, HTTPException, Response, Query
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from pydantic import BaseModel

# Add parent directories to sys.path if needed
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)
NOISE_FILTER_PATH = os.path.join(PROJECT_ROOT, "Noise filter module")
if NOISE_FILTER_PATH not in sys.path:
    sys.path.append(NOISE_FILTER_PATH)

from .. import gmail
from .. import pdf
from ..state import user_credentials
from brd_module.storage import store_chunks
from classifier import classify_chunks
from schema import ClassifiedChunk, SignalLabel

router = APIRouter(prefix="/integrations/gmail", tags=["Gmail Integration"])

# Configuration
CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

def _get_redirect_uri():
    backend_public_url = os.getenv("BACKEND_PUBLIC_URL", "https://localhost:8000").rstrip("/")
    return f"{backend_public_url}/integrations/gmail/auth/callback"

def _get_frontend_profile_url():
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return f"{frontend_url}/profile"

class GmailIngestRequest(BaseModel):
    session_id: str
    message_ids: List[str]

@router.get("/auth/start")
def gmail_login():
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google credentials not configured in .env")
    
    redirect_uri = _get_redirect_uri()
    client_config = {
        "web": {
            "client_id": CLIENT_ID,
            "project_id": "brd-generator", 
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": CLIENT_SECRET,
            "redirect_uris": [redirect_uri]
        }
    }
    
    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=redirect_uri
    )
    
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true'
    )
    
    return RedirectResponse(authorization_url)

@router.get("/auth/callback")
def gmail_oauth_redirect(request: Request):
    code = request.query_params.get("code")
    frontend_profile = _get_frontend_profile_url()
    
    if not code:
        return RedirectResponse(f"{frontend_profile}?gmail=error&reason=missing_code")
    
    redirect_uri = _get_redirect_uri()
    client_config = {
        "web": {
            "client_id": CLIENT_ID,
            "project_id": "brd-generator",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": CLIENT_SECRET,
            "redirect_uris": [redirect_uri]
        }
    }
    
    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=redirect_uri
    )
    
    try:
        flow.fetch_token(code=code)
    except Exception as e:
        return RedirectResponse(f"{frontend_profile}?gmail=error&reason={str(e)}")
    
    credentials = flow.credentials
    user_credentials["main_user"] = {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": credentials.scopes
    }
    
    return RedirectResponse(f"{frontend_profile}?gmail=connected")

@router.get("/status")
def gmail_status():
    creds_data = user_credentials.get("main_user")
    connected = bool(creds_data)
    available = bool(CLIENT_ID and CLIENT_SECRET)
    
    message = "Gmail is connected." if connected else "Gmail is available but not connected."
    if not available:
        message = "Gmail API is not configured on this backend."
        
    return {
        "available": available,
        "connected": connected,
        "message": message
    }

@router.post("/disconnect")
def gmail_disconnect():
    if "main_user" in user_credentials:
        del user_credentials["main_user"]
    return {"message": "Gmail disconnected."}

@router.get("/check")
def gmail_check(count: int = Query(default=10, ge=1, le=50)):
    creds_data = user_credentials.get("main_user")
    if not creds_data:
        raise HTTPException(status_code=401, detail="User not authenticated.")
    
    credentials = Credentials(**creds_data)
    
    try:
        service = gmail.get_gmail_service(credentials)
        results = service.users().messages().list(userId="me", maxResults=count).execute()
        messages = results.get("messages", [])
        
        if not messages:
            return {"count": 0, "emails": []}
        
        emails = []
        for msg in messages:
            email_data = gmail.get_email_details(service, msg["id"])
            emails.append(email_data)
            
        return {
            "count": len(emails),
            "emails": emails
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ingest")
def gmail_ingest(body: GmailIngestRequest):
    creds_data = user_credentials.get("main_user")
    if not creds_data:
        raise HTTPException(status_code=401, detail="Gmail is not connected.")
    
    if not body.message_ids:
        raise HTTPException(status_code=400, detail="Select at least one message to ingest.")

    credentials = Credentials(**creds_data)
    service = gmail.get_gmail_service(credentials)
    
    chunk_dicts = []
    
    try:
        for msg_id in body.message_ids:
            email_data = gmail.get_email_details(service, msg_id)
            
            # Primary email body chunk
            text = email_data["body"]
            if len(text) >= 15:
                chunk_dicts.append({
                    "cleaned_text": text[:2000],
                    "source_ref": f"gmail:{msg_id}",
                    "speaker": email_data["from"],
                    "source_type": "gmail",
                })
            
            # Attachment chunks
            for att in email_data["attachments"]:
                if att["filename"].lower().endswith(".pdf"):
                    try:
                        pdf_data = gmail.download_attachment(service, msg_id, att["attachment_id"])
                        extracted_text = pdf.extract_text_from_pdf_bytes(pdf_data)
                        if extracted_text and len(extracted_text) >= 15:
                            chunk_dicts.append({
                                "cleaned_text": extracted_text[:2000],
                                "source_ref": f"gmail:{msg_id}:att:{att['filename']}",
                                "speaker": email_data["from"],
                                "source_type": "gmail",
                            })
                    except Exception as e:
                        print(f"Failed to process attachment {att['filename']}: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gmail extraction failed: {e}")

    if not chunk_dicts:
        raise HTTPException(status_code=400, detail="No usable content found in selected emails.")

    # Classify and store
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
                    source_type="gmail",
                    source_ref=raw.get("source_ref", "unknown"),
                    speaker=raw.get("speaker", "Unknown"),
                    raw_text=text,
                    cleaned_text=text,
                    label=label,
                    confidence=0.6,
                    reasoning="Fallback local classification.",
                    flagged_for_review=True,
                )
            )

    for chunk in classified:
        chunk.session_id = body.session_id
    
    store_chunks(classified)

    return {
        "message": f"Ingested {len(chunk_dicts)} items from Gmail.",
        "session_id": body.session_id,
        "item_count": len(classified),
    }
