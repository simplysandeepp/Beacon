from pydantic import BaseModel
from typing import List

class SelectedItemsRequest(BaseModel):
    message_ids: List[str]

class SlackSelectedItemsRequest(BaseModel):
    channel_id: str
    message_ids: List[str]
