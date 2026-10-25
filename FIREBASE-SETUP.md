# VASTRENIX — Firebase Console & Cloud Configuration Guide

This guide details configuring **Google Firebase** under the **Spark (Free) Plan** to power Authentication, multi-tenant Firestore documents, and Cloud Storage for VASTRENIX.

---

## 1. Firebase Project Setup (Spark Plan)

1. Open the [Firebase Console](https://console.firebase.google.com).
2. Click **Add project** and enter project name: `vastrenix` (or your store name).
3. Disable Google Analytics (optional, keeps setup minimal) and click **Create Project**.
4. Confirm project is on the **Spark plan** (Free $0/month default, no credit card required).

---

## 2. Authentication Configuration

1. In the left navigation, click **Build** > **Authentication** > **Get started**.
2. Under the **Sign-in method** tab:
   - Click **Email/Password**.
   - Enable **Email/Password**.
   - Leave *Email link (passwordless sign-in)* disabled.
   - Click **Save**.
3. Under the **Settings** tab > **Authorized domains**:
   - Ensure `localhost` and your Render domain (e.g., `vastrenix-api.onrender.com`) are listed.

---

## 3. Cloud Firestore Setup

1. In the left navigation, click **Build** > **Firestore Database** > **Create database**.
2. Select database location closest to your store operations (e.g., `asia-south1` for India / Mumbai).
3. Select **Start in production mode** (all reads/writes are denied by default until rules are deployed).
4. Click **Create**.

### Deploying Firestore Rules & Indexes
Install the Firebase CLI and deploy the security rules and composite indexes directly from the repository root:

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login to your Google account
firebase login

# Set active project
firebase use <your-project-id>

# Deploy security rules and composite indexes
firebase deploy --only firestore:rules,firestore:indexes
```

---

## 4. Cloud Storage Setup

1. In the left navigation, click **Build** > **Storage** > **Get started**.
2. Select **Start in production mode**.
3. Choose the same storage region as Firestore (e.g., `asia-south1`).
4. Click **Done**. Your storage bucket will be created as `<project-id>.firebasestorage.app`.
5. Deploy storage security rules:
   ```bash
   firebase deploy --only storage
   ```

---

## 5. Generating Admin SDK Service Account Key

The FastAPI backend connects to Firebase via the Admin SDK using a service account private key:

1. In the Firebase Console, click the gear icon ⚙️ (Project settings) in the top left.
2. Navigate to the **Service accounts** tab.
3. Verify that **Firebase Admin SDK** is selected.
4. Click **Generate new private key** and confirm by clicking **Generate key**.
5. A JSON file will download (e.g., `vastrenix-firebase-adminsdk-xxxxx.json`).

### Adding to Render
1. Open the downloaded JSON file in a text editor.
2. Copy the entire file contents.
3. Go to [Render Dashboard](https://dashboard.render.com) > your Web Service > **Environment**.
4. Add a new variable:
   - **Key**: `FIREBASE_SERVICE_ACCOUNT_JSON`
   - **Value**: *(Paste the full JSON string)*
5. Click **Save Changes**. Render will automatically redeploy the service.

---

## 6. Local Development with Firebase Emulator (Optional)

To test Firestore and Auth locally without hitting the cloud:

```bash
# Start the Firebase Emulator suite
firebase emulators:start --only auth,firestore,storage

# In a separate terminal, export the emulator host and run tests
export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
pytest backend/tests/ -v
```

---

## 7. Security Guarantee

- **Zero Client-Side Stock Manipulation**: All inventory deductions run through atomic backend Firestore transactions (`db.transaction()`) with row locking and idempotency validation.
- **Strict Staff Approval Flow**: Unapproved staff attempting to access any store resources receive an HTTP `403 Forbidden` with the exact pending approval message.
- **Financial Immutability**: Posted invoices in Firestore cannot be updated or deleted by clients.
