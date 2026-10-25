import os
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Union

logger = logging.getLogger("vastrenix.firebase")

try:
    import firebase_admin
    from firebase_admin import credentials, messaging, firestore, storage, auth
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    logger.warning("firebase_admin package not installed.")


class FirebaseService:
    def __init__(self):
        self.app: Optional[Any] = None
        self.is_configured: bool = False
        self.firestore_db: Optional[Any] = None
        self.storage_bucket: Optional[Any] = None
        self.project_id: Optional[str] = None
        self._initialize()

    def _initialize(self):
        """
        Initializes Firebase Admin SDK ONCE.
        Primary source: FIREBASE_SERVICE_ACCOUNT_JSON environment variable (full JSON string).
        Secondary source (local dev only): FIREBASE_CREDENTIALS_PATH or local uncommitted key.
        """
        if not FIREBASE_AVAILABLE:
            if self._is_production():
                raise RuntimeError("FATAL: firebase_admin is not installed in production environment.")
            return

        # Check if already initialized in this process
        if firebase_admin._apps:
            self.app = firebase_admin.get_app()
            self._setup_clients()
            return

        cred_json_str = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH")
        local_key_candidates = [cred_path, "firebase-service-account.json", "backend/firebase-service-account.json"]

        cred = None

        if cred_json_str and cred_json_str.strip():
            try:
                cred_dict = json.loads(cred_json_str)
                cred = credentials.Certificate(cred_dict)
                self.project_id = cred_dict.get("project_id")
                logger.info(f"Loaded Firebase credentials from FIREBASE_SERVICE_ACCOUNT_JSON env var (Project: {self.project_id})")
            except Exception as e:
                msg = f"FATAL: FIREBASE_SERVICE_ACCOUNT_JSON is malformed JSON: {e}"
                logger.error(msg)
                if self._is_production():
                    raise RuntimeError(msg)
        else:
            # Fallback for local development if uncommitted file exists
            for p in local_key_candidates:
                if p and os.path.exists(p):
                    try:
                        with open(p, "r") as f:
                            cred_dict = json.load(f)
                            self.project_id = cred_dict.get("project_id")
                        cred = credentials.Certificate(p)
                        logger.info(f"Loaded Firebase credentials from local file: {p} (Project: {self.project_id})")
                        break
                    except Exception as e:
                        logger.warning(f"Could not load key from {p}: {e}")

        if cred:
            try:
                storage_bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET", f"{self.project_id}.firebasestorage.app" if self.project_id else "vastrenix.firebasestorage.app")
                self.app = firebase_admin.initialize_app(cred, {
                    "storageBucket": storage_bucket_name,
                    "projectId": self.project_id
                })
                self._setup_clients()
                logger.info(f"Firebase Admin SDK successfully initialized for project '{self.project_id}'")
            except Exception as e:
                logger.error(f"Failed to initialize Firebase Admin app: {e}")
                if self._is_production():
                    raise RuntimeError(f"FATAL: Firebase Admin SDK initialization failed: {e}")
        else:
            # If in production and no credentials could be loaded, FAIL LOUDLY
            if self._is_production():
                raise RuntimeError(
                    "FATAL: FIREBASE_SERVICE_ACCOUNT_JSON environment variable is missing or empty! "
                    "In Render production, you must set FIREBASE_SERVICE_ACCOUNT_JSON in the Render Dashboard "
                    "under Environment > Secret Files / Environment Variables with your Firebase service account JSON."
                )
            logger.warning("Firebase Admin running in test/local fallback mode (no live credentials).")

    def _setup_clients(self):
        try:
            self.firestore_db = firestore.client()
            self.storage_bucket = storage.bucket()
            self.is_configured = True
        except Exception as e:
            logger.error(f"Error initializing Firestore/Storage clients: {e}")
            if self._is_production():
                raise RuntimeError(f"FATAL: Could not initialize Firestore or Storage client: {e}")

    def _is_production(self) -> bool:
        env = os.getenv("ENVIRONMENT", "").lower()
        is_render = bool(os.getenv("RENDER") or os.getenv("RENDER_SERVICE_ID"))
        is_testing = os.getenv("TESTING", "").lower() == "true"
        if is_testing:
            return False
        return env in ("production", "prod") or is_render

    # =========================================================================
    # FIREBASE CLOUD MESSAGING (FCM)
    # =========================================================================
    def send_push_notification(
        self,
        title: str,
        body: str,
        token: Optional[str] = None,
        topic: Optional[str] = "all_staff",
        data: Optional[Dict[str, str]] = None
    ) -> dict:
        data_payload = {k: str(v) for k, v in (data or {}).items()}
        data_payload["timestamp"] = datetime.now(timezone.utc).isoformat()

        if os.getenv("TESTING") == "true" or not self.is_configured:
            logger.info(f"[Firebase Mock FCM] Topic: {topic} | Token: {token} | Title: {title}")
            return {"status": "QUEUED_LOCAL", "mode": "FALLBACK", "title": title, "body": body}

        try:
            notification = messaging.Notification(title=title, body=body)
            message = messaging.Message(
                notification=notification,
                data=data_payload,
                token=token if token else None,
                topic=topic if not token else None
            )
            response = messaging.send(message)
            return {"status": "DELIVERED", "message_id": response, "title": title}
        except Exception as e:
            logger.error(f"Error sending Firebase notification: {e}")
            return {"status": "ERROR", "error": str(e)}

    def notify_staff_order_assigned(self, staff_id: int, order_number: str, buyer_name: str, store_name: str) -> dict:
        """Notifies staff member when an incoming order is assigned to them."""
        title = f"New Order Assigned: {order_number}"
        body = f"Store {store_name} has assigned you order {order_number} from {buyer_name} for packing and fulfillment."
        return self.send_push_notification(
            title=title,
            body=body,
            topic=f"staff_{staff_id}",
            data={"order_number": order_number, "action": "ORDER_ASSIGNED", "store": store_name}
        )

    def notify_order_status_change(self, order_number: str, status: str, buyer_name: str, lr_number: str = None) -> dict:
        """Notifies stakeholders when dealer order transitions state."""
        title = f"Order {order_number} {status}"
        body = f"Order for {buyer_name} is now {status}."
        if lr_number:
            body += f" Transporter LR: {lr_number}."
        return self.send_push_notification(
            title=title,
            body=body,
            topic="dealer_orders",
            data={"order_number": order_number, "status": status, "lr_number": lr_number or ""}
        )

    # =========================================================================
    # CLOUD FIRESTORE DIRECT SYNC HELPERS
    # =========================================================================
    def sync_to_firestore(self, collection: str, doc_id: str, data: Dict[str, Any]) -> dict:
        """Saves or updates a document in Cloud Firestore for real-time mobile sync."""
        if os.getenv("TESTING") == "true" or not self.is_configured or not self.firestore_db:
            return {"status": "LOCAL_MOCK", "collection": collection, "doc_id": doc_id}
        try:
            clean_data = {}
            for k, v in data.items():
                if isinstance(v, (datetime,)):
                    clean_data[k] = v.isoformat()
                elif hasattr(v, '__float__'):
                    clean_data[k] = float(v)
                else:
                    clean_data[k] = v
            clean_data["last_synced_at"] = firestore.SERVER_TIMESTAMP
            self.firestore_db.collection(collection).document(str(doc_id)).set(clean_data, merge=True)
            return {"status": "SYNCED", "collection": collection, "doc_id": doc_id}
        except Exception as e:
            logger.error(f"Firestore sync error: {e}")
            return {"status": "ERROR", "error": str(e)}

    def get_from_firestore(self, collection: str, doc_id: str) -> Optional[dict]:
        """Reads a document from Cloud Firestore."""
        if not self.is_configured or not self.firestore_db:
            return None
        try:
            doc = self.firestore_db.collection(collection).document(str(doc_id)).get()
            return doc.to_dict() if doc.exists else None
        except Exception as e:
            logger.error(f"Firestore read error: {e}")
            return None

    # =========================================================================
    # CLOUD STORAGE
    # =========================================================================
    def upload_to_storage(
        self,
        content: Union[str, bytes],
        destination_blob_name: str,
        content_type: str = "application/octet-stream"
    ) -> dict:
        if "PYTEST_CURRENT_TEST" in os.environ or os.getenv("TESTING") == "true" or not self.is_configured or not self.storage_bucket:
            return {
                "status": "LOCAL_STORED",
                "destination": destination_blob_name,
                "url": f"/static/storage/{destination_blob_name}",
                "public_url": f"/static/storage/{destination_blob_name}"
            }

        try:
            blob = self.storage_bucket.blob(destination_blob_name)
            if isinstance(content, str) and os.path.exists(content):
                blob.upload_from_filename(content, content_type=content_type)
            elif isinstance(content, bytes):
                blob.upload_from_string(content, content_type=content_type)
            else:
                blob.upload_from_string(str(content), content_type=content_type)

            return {
                "status": "UPLOADED",
                "bucket": self.storage_bucket.name,
                "blob_name": destination_blob_name,
                "public_url": f"https://firebasestorage.googleapis.com/v0/b/{self.storage_bucket.name}/o/{destination_blob_name.replace('/', '%2F')}?alt=media"
            }
        except Exception as e:
            logger.error(f"Firebase Storage upload error: {e}")
            return {"status": "ERROR", "error": str(e)}


# Singleton Instance
firebase_service = FirebaseService()

# FastAPI Dependency Providers
def get_firebase_service() -> FirebaseService:
    return firebase_service

def get_firestore_db():
    """Dependency for injecting Firestore client into FastAPI routes."""
    return firebase_service.firestore_db

def get_storage_bucket():
    """Dependency for injecting Cloud Storage bucket into FastAPI routes."""
    return firebase_service.storage_bucket

def get_firebase_auth():
    """Dependency for injecting Firebase Auth module."""
    if not FIREBASE_AVAILABLE:
        return None
    return auth
