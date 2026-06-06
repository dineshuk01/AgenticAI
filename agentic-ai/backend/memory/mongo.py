import os
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGODB_URI)
db = client.agentdb

agent_memory_coll = db.agent_memory
session_history_coll = db.session_history
checkpoints_coll = db.checkpoints
users_coll = db.users

async def read_memory(key: str, session_id: str) -> str | None:
    doc = await agent_memory_coll.find_one({"key": key, "session_id": session_id})
    if doc:
        return doc.get("value")
    return None

async def write_memory(key: str, value: str, session_id: str) -> None:
    await agent_memory_coll.update_one(
        {"key": key, "session_id": session_id},
        {"$set": {"value": value, "updatedAt": datetime.utcnow()}},
        upsert=True
    )

async def list_memory(session_id: str) -> list[dict]:
    cursor = agent_memory_coll.find({"session_id": session_id})
    memories = []
    async for doc in cursor:
        memories.append({
            "key": doc.get("key"),
            "value": doc.get("value"),
            "updatedAt": doc.get("updatedAt"),
            "session_id": doc.get("session_id")
        })
    return memories

async def clear_memory(session_id: str) -> None:
    await agent_memory_coll.delete_many({"session_id": session_id})

async def save_checkpoint(thread_id: str, state: dict) -> None:
    await checkpoints_coll.update_one(
        {"thread_id": thread_id},
        {"$set": {"state": state, "updatedAt": datetime.utcnow()}},
        upsert=True
    )

async def load_checkpoint(thread_id: str) -> dict | None:
    doc = await checkpoints_coll.find_one({"thread_id": thread_id})
    if doc:
        return doc.get("state")
    return None

async def save_session(session_id: str, messages: list[dict]) -> None:
    await session_history_coll.update_one(
        {"session_id": session_id},
        {"$set": {"messages": messages, "createdAt": datetime.utcnow()}},
        upsert=True
    )

async def load_session(session_id: str) -> list[dict]:
    doc = await session_history_coll.find_one({"session_id": session_id})
    if doc:
        return doc.get("messages", [])
    return []

async def create_user(name: str, email: str, password_hash: str) -> None:
    await users_coll.update_one(
        {"email": email},
        {"$set": {"name": name, "password_hash": password_hash, "createdAt": datetime.utcnow()}},
        upsert=True
    )

async def get_user_by_email(email: str) -> dict | None:
    doc = await users_coll.find_one({"email": email})
    return doc
