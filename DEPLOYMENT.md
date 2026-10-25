# VASTRENIX — Render Web Service Deployment Guide

This guide details the step-by-step production deployment of the **VASTRENIX FastAPI Backend** to [Render](https://render.com) (Free Web Service tier), configured to connect to **Firebase** (Spark Free Plan) for Authentication, Firestore multi-tenant data, and Cloud Storage.

---

## 1. Architecture Overview

```
                      +---------------------------------------+
                      |       Flutter Client (Mobile/Web)     |
                      +-------------------+-------------------+
                                          |
                        1. Sign-in via    |  2. Sends API calls with
                        Firebase Auth SDK |     Authorization: Bearer <ID_TOKEN>
                                          v
                      +---------------------------------------+
                      |         FastAPI Backend on Render     |
                      |  - Validates Firebase ID Token        |
                      |  - Enforces Role & Approval Matrix    |
                      |  - Runs ACID Atomic Inventory Txns    |
                      +-------------------+-------------------+
                                          |
                                          | 3. Admin SDK (Direct Access)
                                          v
                      +---------------------------------------+
                      |         Google Firebase (Spark)       |
                      |  - Cloud Firestore (Multi-tenant DB)  |
                      |  - Cloud Storage (PDF Invoices/Media) |
                      |  - Cloud Messaging (FCM Push Alerts)  |
                      +---------------------------------------+
```

> [!IMPORTANT]
> The **FastAPI backend is the only entity that communicates directly with Firestore and Cloud Storage**. The Flutter application never connects directly to Firestore for transactional writes or stock manipulation, guaranteeing zero client-side stock overrides and bulletproof Decimal financial math.

---

## 2. Render Web Service Setup

### Step 1: Create Web Service on Render
1. Log in to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** > **Web Service**.
3. Select **Build and deploy from a Git repository** and connect your `Vastranix` repository.
4. Configure the service settings:
   - **Name**: `vastrenix-api` (or your chosen service name)
   - **Region**: Choose the region closest to your primary stores (e.g., `Singapore` or `Frankfurt`).
   - **Branch**: `main`
   - **Root Directory**: Leave blank (uses repo root where `main.py` and `requirements.txt` reside).
   - **Runtime**: `Python 3`
   - **Instance Type**: `Free`

### Step 2: Build & Start Commands
Configure the exact deployment commands:
- **Build Command**:
  ```bash
  pip install -r requirements.txt
  ```
- **Start Command**:
  ```bash
  uvicorn main:app --host 0.0.0.0 --port $PORT
  ```

---

## 3. Environment Variables Configuration

In Render Dashboard, navigate to **Environment** under your service and configure the following variables:

| Variable Name | Required | Example / Recommended Value | Description |
|---|---|---|---|
| `ENVIRONMENT` | **Yes** | `production` | Enables strict production error handling and loud failures. |
| `PORT` | Auto | `10000` | Automatically injected by Render. Bound via `$PORT` in start command. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Yes** | `{"type":"service_account","project_id":"..."}` | Minified full JSON string of your Firebase service account key. |
| `SECRET_KEY` | **Yes** | *(generate 64-char random string)* | Used for cryptographic signing and internal fallback session tokens. |
| `DATABASE_URL` | **Yes** | `sqlite:///./vastrenix.db` | Path to persistent database (or PostgreSQL connection string). |
| `FIREBASE_STORAGE_BUCKET` | Optional | `your-project-id.firebasestorage.app` | Target bucket for invoice PDFs and product media. |

> [!CAUTION]
> **Never commit your service account key or `.env` file to Git!** Verify that `FIREBASE_SERVICE_ACCOUNT_JSON` is stored only in Render's Environment secrets.

---

## 4. Cold-Start Handling on Render Free Tier

Render's free tier spins down web services after **15 minutes of inactivity**. The first incoming HTTP request wakes the container, taking **30 to 50 seconds** to complete its cold-start.

### Client-Side Pre-Warming & Polished UX
1. **Pre-warming Ping**: When the Flutter app opens or resumes from background, it immediately issues a lightweight `GET /health` or `GET /api/v1/sync/firebase/status` request in the background.
2. **Graceful Loading UI**:
   - If the first request takes longer than 2.5 seconds, the mobile app displays a subtle boutique-themed status: *"Connecting to your store server..."* with an animated progress pulse.
   - Timeout thresholds on the mobile HTTP client are configured for 60 seconds on initial connect to avoid premature failure.
3. **No Duplicate Sales**:
   - If a cashier scans a barcode or hits "Post Sale" while the server is waking, request payloads carry a unique `idempotency_key`. If a connection drops and retries, the server recognizes the key and returns the posted invoice without duplicate billing.

---

## 5. Rollback & Troubleshooting

### How to Rollback a Deployment
1. Go to your service in [dashboard.render.com](https://dashboard.render.com).
2. Click on the **Events** or **Deploys** tab on the left sidebar.
3. Locate the last known healthy deploy (marked with a green checkmark).
4. Click the three dots `...` next to that deploy and select **Rollback to this deploy**.
5. Render immediately switches traffic back to that build container without rebuilding.

### Verification Commands
Once deployed, verify your service using `curl`:

```bash
# 1. Health check
curl -i https://vastrenix-api.onrender.com/health

# 2. Firebase status check
curl -i https://vastrenix-api.onrender.com/api/v1/sync/firebase/status

# 3. Test unauthenticated request rejection (401)
curl -i https://vastrenix-api.onrender.com/api/v1/auth/me
```
Expected output for `/health`:
```json
{"status":"healthy","project":"VASTRENIX","tagline":"Your Business, Beautifully in Sync."}
```
