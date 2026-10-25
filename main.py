"""
VASTRENIX — Production Cloud Web Entrypoint for Render
Runs: uvicorn main:app --host 0.0.0.0 --port $PORT
"""
import os
import sys

# Ensure repository root is on Python module search path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from backend.app.main import app

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
