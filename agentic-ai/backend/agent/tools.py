from langchain.tools import tool
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_experimental.tools.python.tool import PythonREPLTool
from memory import mongo

@tool
def web_search(query: str) -> str:
    """Search the web for current information."""
    try:
        search = TavilySearchResults(max_results=3)
        results = search.invoke({"query": query})
        return str(results)
    except Exception as e:
        return f"Error performing web search: {str(e)}"

@tool
def run_python(code: str) -> str:
    """Execute Python code and return output."""
    try:
        repl = PythonREPLTool()
        output = repl.invoke(code)
        return output
    except Exception as e:
        return f"Error executing Python code: {str(e)}"

@tool
async def read_memory(key: str, user_email: str) -> str:
    """Retrieve a stored memory value by key and user_email."""
    value = await mongo.read_memory(key, user_email)
    return value if value else f"No memory found for key: {key}"

@tool
async def write_memory(key: str, value: str, user_email: str) -> str:
    """Save a value to persistent memory."""
    await mongo.write_memory(key, value, user_email)
    return f"Saved: {key} = {value}"

@tool
async def list_memory(user_email: str) -> str:
    """List all stored memory keys and values."""
    memories = await mongo.list_memory(user_email)
    if not memories:
        return "No memories found."
    return str([{"key": m["key"], "value": m["value"]} for m in memories])

import os

@tool
def save_to_file(filename: str, content: str, user_email: str = "") -> str:
    """Save content to a local file in the workspace."""
    try:
        import os
        safe_filename = os.path.basename(filename)
        if user_email:
            user_dir = os.path.join("uploads", user_email)
        else:
            user_dir = "uploads"
        os.makedirs(user_dir, exist_ok=True)
        file_path = os.path.join(user_dir, safe_filename)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Successfully wrote to {safe_filename}"
    except Exception as e:
        return f"Error writing to file: {str(e)}"

@tool
def read_file(filename: str, user_email: str = "") -> str:
    """Read content from a local file in the workspace."""
    try:
        import os
        safe_filename = os.path.basename(filename)
        if user_email:
            user_dir = os.path.join("uploads", user_email)
        else:
            user_dir = "uploads"
        file_path = os.path.join(user_dir, safe_filename)
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {str(e)}"
