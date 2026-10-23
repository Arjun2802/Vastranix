import os
import sys
import webbrowser
import threading
import time
import uvicorn

# Set root directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from backend.app.main import app
from backend.seed_demo import seed_database

def open_browser():
    time.sleep(1.2)
    webbrowser.open("http://127.0.0.1:8000")

def main():
    print("========================================")
    print("   VASTRENIX — Clothing Business ERP   ")
    print("   'Your Business, Beautifully in Sync' ")
    print("========================================")
    
    # Auto-seed demo database if fresh
    try:
        seed_database()
    except Exception as e:
        print(f"Database check: {e}")

    # Launch browser in separate thread
    threading.Thread(target=open_browser, daemon=True).start()

    # Start FastAPI server
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")

if __name__ == "__main__":
    main()
