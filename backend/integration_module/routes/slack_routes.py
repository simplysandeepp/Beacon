from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse
import os
import slack_auth
import pdf
from state import user_credentials
from models import SlackSelectedItemsRequest

router = APIRouter(prefix="/slack", tags=["Slack"])

@router.get("/login")
def slack_login():
    if not os.getenv("SLACK_CLIENT_ID") or not os.getenv("SLACK_CLIENT_SECRET"):
        raise HTTPException(status_code=500, detail="Slack credentials not configured in .env")
    
    auth_url = slack_auth.get_slack_auth_url()
    return RedirectResponse(auth_url)

@router.get("/oauth_redirect")
def slack_oauth_redirect(request: Request):
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")
    
    try:
        auth_response = slack_auth.exchange_code_for_token(code)
        
        # Store Slack credentials
        user_credentials["slack_user"] = {
            "access_token": auth_response.get("access_token"),
            "team_id": auth_response.get("team", {}).get("id"),
            "bot_user_id": auth_response.get("bot_user_id"),
            "scopes": auth_response.get("scope")
        }
        
        return {
            "message": "Slack authentication successful!",
            "team_name": auth_response.get("team", {}).get("name"),
            "access_granted": auth_response.get("scope")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Slack authentication failed: {str(e)}")

@router.get("/messages")
def slack_messages(channel_id: str):
    creds_data = user_credentials.get("slack_user")
    if not creds_data:
        raise HTTPException(status_code=401, detail="Slack user not authenticated. Go to /slack/login")
    
    token = creds_data.get("access_token")
    try:
        messages = slack_auth.get_channel_messages(token, channel_id)
        
        # Resolve user IDs to names
        user_cache = {}
        processed_messages = []
        
        for msg in messages:
            user_id = msg.get("user")
            if user_id:
                if user_id not in user_cache:
                    user_info = slack_auth.get_user_info(token, user_id)
                    user_cache[user_id] = user_info.get("real_name", user_id) if user_info else user_id
                msg["user_name"] = user_cache[user_id]
            
            # Apply regex cleaning to Slack message text
            msg["text"] = slack_auth.strip_slack_formatting(msg.get("text", ""))
            
            # Process files to find PDFs
            msg["parsed_pdfs"] = []
            if "files" in msg:
                for f in msg["files"]:
                    if f.get("filetype") == "pdf" or f.get("name", "").lower().endswith(".pdf"):
                        try:
                            # Download PDF content
                            pdf_url = f.get("url_private_download")
                            if pdf_url:
                                pdf_data = slack_auth.download_slack_file(token, pdf_url)
                                # Extract text
                                extracted_text = pdf.extract_text_from_pdf_bytes(pdf_data)
                                msg["parsed_pdfs"].append({
                                    "name": f.get("name"),
                                    "extracted_text": extracted_text
                                })
                        except Exception as e:
                            print(f"Error parsing Slack PDF {f.get('name')}: {e}")
            
            processed_messages.append(msg)
            
        return {
            "channel_id": channel_id,
            "count": len(processed_messages),
            "messages": processed_messages
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Slack messages: {str(e)}")

@router.get("/channels")
def slack_channels():
    creds_data = user_credentials.get("slack_user")
    if not creds_data:
        raise HTTPException(status_code=401, detail="Slack user not authenticated. Go to /slack/login")
    
    token = creds_data.get("access_token")
    try:
        channels = slack_auth.list_channels(token)
        return {
            "count": len(channels),
            "channels": [
                {"id": c["id"], "name": c["name"], "is_member": c.get("is_member")}
                for c in channels
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list Slack channels: {str(e)}")

@router.get("/post")
def slack_post(channel_id: str, text: str):
    creds_data = user_credentials.get("slack_user")
    if not creds_data:
        raise HTTPException(status_code=401, detail="Slack user not authenticated. Go to /slack/login")
    
    token = creds_data.get("access_token")
    try:
        result = slack_auth.post_message(token, channel_id, text)
        return {
            "message": "Message posted successfully!",
            "ts": result.get("ts"),
            "channel": result.get("channel")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to post Slack message: {str(e)}")

@router.post("/process_selected")
def slack_process_selected(request: SlackSelectedItemsRequest):
    creds_data = user_credentials.get("slack_user")
    if not creds_data:
        raise HTTPException(status_code=401, detail="Slack user not authenticated. Go to /slack/login")
    
    token = creds_data.get("access_token")
    try:
        messages = slack_auth.get_channel_messages(token, request.channel_id)
        selected_msgs = [m for m in messages if m.get("ts") in request.message_ids]
        
        chunks = []
        user_cache = {}
        
        for msg in selected_msgs:
            user_id = msg.get("user")
            if user_id and user_id not in user_cache:
                user_info = slack_auth.get_user_info(token, user_id)
                user_cache[user_id] = user_info.get("real_name", user_id) if user_info else user_id
            
            speaker = user_cache.get(user_id, user_id) if user_id else "Unknown"
            
            cleaned_text = slack_auth.strip_slack_formatting(msg.get("text", ""))
            chunks.append({
                "source_ref": msg["ts"],
                "speaker": speaker,
                "raw_text": msg.get("text", ""),
                "cleaned_text": cleaned_text,
                "subject": f"Slack Message in {request.channel_id}"
            })
            
            if "files" in msg:
                for f in msg["files"]:
                    if f.get("filetype") == "pdf" or f.get("name", "").lower().endswith(".pdf"):
                        pdf_url = f.get("url_private_download")
                        if pdf_url:
                            pdf_data = slack_auth.download_slack_file(token, pdf_url)
                            extracted_text = pdf.extract_text_from_pdf_bytes(pdf_data)
                            if extracted_text:
                                chunks.append({
                                    "source_ref": f"{msg['ts']}_{f.get('name')}",
                                    "speaker": speaker,
                                    "raw_text": f"Slack PDF File: {f.get('name')}\n{extracted_text}",
                                    "cleaned_text": extracted_text,
                                    "subject": f"Slack File in {request.channel_id}"
                                })
                                
        return {"count": len(chunks), "chunks": chunks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
