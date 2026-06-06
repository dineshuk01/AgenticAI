import json
import asyncio
import os
import shutil
import warnings
from dotenv import load_dotenv

load_dotenv()

# Suppress all warnings to prevent LangChainPendingDeprecationWarning during imports
warnings.filterwarnings("ignore")
from fastapi import FastAPI, Request, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from langchain_core.messages import HumanMessage
from agent.graph import app as agent_graph
from memory import mongo

app = FastAPI(title="Agentic AI API")

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RunRequest(BaseModel):
    goal: str
    session_id: str

@app.post("/run")
async def run_agent(request: RunRequest):
    async def event_generator():
        initial_state = {
            "messages": [HumanMessage(content=request.goal)],
            "session_id": request.session_id,
            "iteration": 0,
            "steps": [],
            "final_answer": None
        }
        
        config = {"configurable": {"thread_id": request.session_id}}
        
        try:
            async for output in agent_graph.astream(initial_state, config=config, stream_mode="updates"):
                for node_name, state_update in output.items():
                    steps = state_update.get("steps", [])
                    for step in steps:
                        yield json.dumps(step)
                        await asyncio.sleep(0.01)
                    
                    if "final_answer" in state_update and state_update["final_answer"] and "evaluation" in state_update:
                        final_event = {
                            "type": "final",
                            "answer": state_update["final_answer"],
                            "evaluation": state_update["evaluation"]
                        }
                        yield json.dumps(final_event)
                        
            # If the graph finished but evaluation wasn't explicitly yielded:
            # We can fetch the latest state
            latest_state = agent_graph.get_state(config).values
            if "evaluation" in latest_state and "final_answer" in latest_state:
                final_event = {
                    "type": "final",
                    "answer": latest_state["final_answer"],
                    "evaluation": latest_state["evaluation"]
                }
                yield json.dumps(final_event)

        except Exception as e:
            yield json.dumps({"type": "error", "content": str(e)})

    return EventSourceResponse(event_generator())

@app.get("/memory/{session_id}")
async def get_memory(session_id: str):
    memories = await mongo.list_memory(session_id)
    return {"memories": memories}

@app.delete("/memory/{session_id}")
async def delete_memory(session_id: str):
    await mongo.clear_memory(session_id)
    return {"status": "cleared"}

@app.get("/history/{session_id}")
async def get_history(session_id: str):
    messages = await mongo.load_session(session_id)
    return {"messages": messages}

@app.get("/health")
async def health_check():
    return {"status": "ok", "mongo": "connected"}

@app.post("/upload-file")
async def upload_file(file: UploadFile = File(...)):
    file_location = f"uploads/{file.filename}"
    with open(file_location, "wb") as f:
        shutil.copyfileobj(file.file, f)
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
    return {"url": f"{backend_url}/uploads/{file.filename}", "filename": file_location}

@app.get("/workspace-files")
async def get_workspace_files():
    files = []
    if os.path.exists("uploads"):
        files = [f for f in os.listdir("uploads") if os.path.isfile(os.path.join("uploads", f))]
    return {"files": files}

@app.delete("/workspace-files/{filename}")
async def delete_workspace_file(filename: str):
    file_path = os.path.join("uploads", filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return {"status": "deleted"}
    return {"status": "not_found", "error": "File not found"}
