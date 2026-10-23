import os
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Union

logger = logging.getLogger("vastrenix.firebase")

try:
    import firebase_admin
    from firebase_admin import credentials, messaging, firestore, storage
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    logger.info("firebase_admin package not installed. Operating in fallback mode.")

class FirebaseService:
    def __init__(self):
        self.app = None
        self.is_configured = False
        self.firestore_db = None
        self.storage_bucket = None
        self._initialize()

    def _initialize(self):
        cred_paths = [
            os.getenv("FIREBASE_CREDENTIALS_PATH"),
            "firebase-service-account.json",
            "backend/firebase-service-account.json"
        ]
        
        selected_path = None
        for p in cred_paths:
            if p and os.path.exists(p):
                selected_path = p
                break

        if selected_path and FIREBASE_AVAILABLE:
            try:
                # Check if already initialized to avoid re-init error in testing/reloads
                if not firebase_admin._apps:
                    cred = credentials.Certificate(selected_path)
                    self.app = firebase_admin.initialize_app(cred, {
                        "storageBucket": "vastrenix.firebasestorage.app",
                        "projectId": "vastranix"
                    })
                else:
                    self.app = firebase_admin.get_app()

                self.firestore_db = firestore.client()
                self.storage_bucket = storage.bucket()
                self.is_configured = True
                logger.info(f"Firebase Admin SDK successfully connected to project: {self.app.project_id}")
            except Exception as e:
                logger.warning(f"Failed to initialize Firebase Admin SDK: {e}")
                self.is_configured = False
        else:
            self.is_configured = False

    # =========================================================================
    # 1. FIREBASE CLOUD MESSAGING (FCM) — 100% Free Unlimited Push Notifications
    # =========================================================================
    def send_push_notification(
        self,
        title: str,
        body: str,
        token: Optional[str] = None,
        topic: Optional[str] = "all_staff",
        data: Optional[Dict[str, str]] = None
    ) -> dict:
        """
        Sends push notification via Firebase Cloud Messaging (FCM).
        FCM is 100% Free with unlimited messages on Firebase Spark Plan.
        """
        data_payload = {k: str(v) for k, v in (data or {}).items()}
        data_payload["timestamp"] = datetime.now(timezone.utc).isoformat()

        if os.getenv("TESTING") == "true" or not self.is_configured:
            logger.info(f"[Firebase Mock FCM] Topic: {topic} | Token: {token} | Title: {title} | Body: {body}")
            return {
                "status": "QUEUED_LOCAL",
                "mode": "FALLBACK",
                "message": "Firebase test mode or not active. In-app notification logged.",
                "title": title,
                "body": body
            }

        try:
            notification = messaging.Notification(title=title, body=body)
            if token:
                message = messaging.Message(
                    notification=notification,
                    data=data_payload,
                    token=token,
                )
            else:
                message = messaging.Message(
                    notification=notification,
                    data=data_payload,
                    topic=topic,
                )
            response = messaging.send(message)
            logger.info(f"FCM push notification delivered: {response}")
            return {"status": "DELIVERED", "message_id": response, "title": title}
        except Exception as e:
            logger.error(f"Error sending Firebase notification: {e}")
            return {"status": "ERROR", "error": str(e)}

    def notify_staff_order_assigned(self, staff_id: int, order_number: str, store_name: str, buyer_name: str) -> dict:
        """Notifies a specific staff member when an incoming order is assigned to them."""
        title = f"New Order Assigned: {order_number}"
        body = f"Store {store_name} has assigned you order {order_number} from {buyer_name} for packing and fulfillment."
        # Broadcasts to the staff-specific topic e.g. "staff_4"
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
    # 2. CLOUD FIRESTORE — Real-Time Cross-Branch & Device Synchronization
    # =========================================================================
    def sync_to_firestore(self, collection: str, doc_id: str, data: Dict[str, Any]) -> dict:
        """
        Saves or updates a document in Cloud Firestore for real-time mobile sync.
        """
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
    # 3. CLOUD STORAGE — Garment Catalog Photos & Authoritative PDF Bills
    # =========================================================================
    def upload_to_storage(
        self,
        content: Union[str, bytes],
        destination_blob_name: str,
        content_type: str = "application/octet-stream"
    ) -> dict:
        """
        Uploads a file or bytes directly to Firebase Cloud Storage (vastrenix.firebasestorage.app).
        """
        if not self.is_configured or not self.storage_bucket:
            return {
                "status": "LOCAL_STORED",
                "destination": destination_blob_name,
                "url": f"/static/storage/{destination_blob_name}"
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

firebase_service = FirebaseService()
