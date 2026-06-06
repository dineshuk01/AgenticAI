from typing import TypedDict, Annotated, Optional
from langchain_core.messages import BaseMessage
from operator import add

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add]
    steps: list[dict]
    session_id: str
    user_email: str
    final_answer: Optional[str]
    evaluation: dict
    iteration: int
    error: Optional[str]
