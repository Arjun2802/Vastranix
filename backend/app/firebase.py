"""
VASTRENIX — Firebase Admin SDK Re-export & FastAPI Dependencies
"""
from backend.app.core.firebase import (
    firebase_service,
    get_firebase_service,
    get_firestore_db,
    get_storage_bucket,
    get_firebase_auth,
    FirebaseService
)

__all__ = [
    "firebase_service",
    "get_firebase_service",
    "get_firestore_db",
    "get_storage_bucket",
    "get_firebase_auth",
    "FirebaseService"
]
