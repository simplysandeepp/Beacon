import os
import re
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from dotenv import load_dotenv
import requests

def download_slack_file(token: str, url: str):
    """
    Downloads a private file from Slack using the provided token.
    """
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.content
    else:
        raise Exception(f"Failed to download Slack file: {response.status_code} {response.text}")

def strip_slack_formatting(text):
    """Remove Slack mentions, channel links, URLs, and simplify formatting."""
    if not text:
        return ""
    # Remove user mentions <@U123...>
    text = re.sub(r'<@U[A-Z0-9]+>', '', text)
    # Remove channel links <#C123...|name> -> name
    text = re.sub(r'<#[A-Z0-9]+\|([^>]+)>', r'\1', text)
    # Remove channel mentions <#C123...>
    text = re.sub(r'<#[A-Z0-9]+>', '', text)
    # Remove special mentions <!here>, <!channel>, etc.
    text = re.sub(r'<![a-z]+>', '', text)
    # Simplify links with text <http...|text> -> text
    text = re.sub(r'<https?://[^|> ]+\|([^>]+)>', r'\1', text)
    # Remove raw URLs <http...>
    text = re.sub(r'<https?://[^> ]+>', '', text)
    # Remove standard URLs (not in brackets)
    text = re.sub(r'https?://\S+|www\.\S+', '', text)
    # Normalize whitespace
    text = text.replace('\n', ' ').replace('\r', ' ')
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

load_dotenv()

SLACK_CLIENT_ID = os.getenv("SLACK_CLIENT_ID")
SLACK_CLIENT_SECRET = os.getenv("SLACK_CLIENT_SECRET")
SLACK_REDIRECT_URI = os.getenv("SLACK_REDIRECT_URI")

def get_slack_auth_url():
    """
    Constructs the Slack authorization URL.
    """
    scopes = "channels:history,groups:history,channels:read,groups:read,users:read"
    return f"https://slack.com/oauth/v2/authorize?client_id={SLACK_CLIENT_ID}&scope={scopes}&redirect_uri={SLACK_REDIRECT_URI}"

def exchange_code_for_token(code: str):
    """
    Exchanges the temporary authorization code for an access token.
    """
    client = WebClient()
    try:
        response = client.oauth_v2_access(
            client_id=SLACK_CLIENT_ID,
            client_secret=SLACK_CLIENT_SECRET,
            code=code,
            redirect_uri=SLACK_REDIRECT_URI
        )
        return response.data
    except SlackApiError as e:
        print(f"Error exchanging code: {e.response['error']}")
        raise e

def get_slack_client(token: str):
    """
    Returns an initialized Slack WebClient.
    """
    return WebClient(token=token)

def get_channel_messages(token: str, channel_id: str):
    """
    Fetches all messages from a specified Slack channel using pagination.
    """
    client = get_slack_client(token)
    messages = []
    try:
        # Initial call
        result = client.conversations_history(channel=channel_id)
        messages.extend(result["messages"])
        
        # Paginate if there are more messages
        while result.get("has_more"):
            cursor = result.get("response_metadata", {}).get("next_cursor")
            if not cursor:
                break
            result = client.conversations_history(channel=channel_id, cursor=cursor)
            messages.extend(result["messages"])
            
        return messages
    except SlackApiError as e:
        print(f"Error fetching messages: {e.response['error']}")
        raise e

def list_channels(token: str):
    """
    Lists public channels in the workspace that the bot has access to.
    """
    client = get_slack_client(token)
    try:
        result = client.conversations_list(types="public_channel,private_channel")
        return result["channels"]
    except SlackApiError as e:
        print(f"Error listing channels: {e.response['error']}")
        raise e

def post_message(token: str, channel_id: str, text: str):
    """
    Sends a message to a Slack channel.
    """
    client = get_slack_client(token)
    try:
        result = client.chat_postMessage(channel=channel_id, text=text)
        return result.data
    except SlackApiError as e:
        print(f"Error posting message: {e.response['error']}")
        raise e

def get_user_info(token: str, user_id: str):
    """
    Fetches user information from Slack.
    """
    client = get_slack_client(token)
    try:
        result = client.users_info(user=user_id)
        return result["user"]
    except SlackApiError as e:
        print(f"Error fetching user info: {e.response['error']}")
        return None
