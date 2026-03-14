# Beacon — Deployment Guide

> Complete step-by-step instructions for deploying Beacon's frontend to **Vercel** and backend to **Render**.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Part 1 — Backend on Render](#2-part-1--backend-on-render)
3. [Part 2 — Frontend on Vercel](#3-part-2--frontend-on-vercel)
4. [Part 3 — Firebase Setup](#4-part-3--firebase-setup)
5. [Part 4 — Slack OAuth Setup](#5-part-4--slack-oauth-setup)
6. [Part 5 — Groq API Key](#6-part-5--groq-api-key)
7. [Part 6 — Database Provisioning](#7-part-6--database-provisioning)
8. [Part 7 — Connect Everything](#8-part-7--connect-everything)
9. [Part 8 — Post-Deploy Smoke Test](#9-part-8--post-deploy-smoke-test)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview

```
GitHub Repo
    │
    ├── backend/   ──────────────→  Render Web Service (Docker)
    │                               URL: https://beacon-api.onrender.com
    │
    └── frontend/  ──────────────→  Vercel Project
                                    URL: https://your-project.vercel.app
```

Deploy the **backend first** so you have the Render URL ready to insert into Vercel's `NEXT_PUBLIC_API_URL` variable.

---

## 2. Part 1 — Backend on Render

### 2.1 Create a New Web Service

1. Go to [https://render.com](https://render.com) and sign in.
2. Click **New → Web Service**.
3. Connect your GitHub account and select the **Beacon** repository.
4. Fill in the fields:

| Field | Value |
|---|---|
| **Name** | `beacon-api` (or any name) |
| **Root Directory** | `backend` |
| **Runtime** | **Docker** (Render will auto-detect the `Dockerfile`) |
| **Instance Type** | Starter ($7/mo) or Free tier |
| **Region** | Choose the region closest to your users |

5. Leave **Build Command** and **Start Command** blank — the Dockerfile handles both.

> **Why Docker?** WeasyPrint (used for PDF/HTML export) requires system libraries (`libcairo2`, `libpango`, `libharfbuzz`) that are installed automatically inside the Docker container. Without Docker, WeasyPrint fails silently on Render's base Ubuntu image.

### 2.2 Add Backend Environment Variables

In the **Environment** tab of your Render service, add each variable below.

#### Groq (Required)

| Key | Value |
|---|---|
| `GROQ_API_KEY` | Your Groq key — starts with `gsk_` |
| `GROQ_CLOUD_API` | Same value as `GROQ_API_KEY` |

Both variables are read by different modules. Set them to the same key.

#### Database (Required)

Use the connection details from your chosen database provider (see [Part 6 — Database Provisioning](#7-part-6--database-provisioning)).

| Key | Example Value |
|---|---|
| `DB_HOST` | `dpg-abc123.oregon-postgres.render.com` |
| `DB_PORT` | `5432` |
| `DB_NAME` | `beacon_aks` |
| `DB_USER` | `beacon_aks_user` |
| `DB_PASS` | `your_db_password` |

> Do **not** use a `DATABASE_URL` connection string — the backend reads individual host/port/name/user/pass variables only.

#### URLs (Required for production)

Set these **after** you have both the Render URL and Vercel URL.

| Key | Value |
|---|---|
| `BACKEND_PUBLIC_URL` | `https://beacon-api.onrender.com` (your Render service URL) |
| `FRONTEND_URL` | `https://your-project.vercel.app` (your Vercel deployment URL) |

#### Slack (Optional — skip if not using Slack integration)

| Key | Value |
|---|---|
| `SLACK_CLIENT_ID` | From your Slack app settings |
| `SLACK_CLIENT_SECRET` | From your Slack app settings |
| `SLACK_REDIRECT_URI` | `https://beacon-api.onrender.com/integrations/slack/auth/callback` |

#### Demo Cache (Optional)

| Key | Value |
|---|---|
| `DEMO_CACHE_SESSION_ID` | Session UUID that holds pre-classified demo data (skip if not needed) |

### 2.3 Deploy

Click **Create Web Service**. Render will:
1. Pull the repo
2. Build the Docker image (`python:3.9-slim-bullseye`, installs WeasyPrint deps)
3. Start uvicorn on port 8000

Wait for the deployment to show **Live** (3–5 minutes on first build).

**Verify:** Open `https://your-render-url.onrender.com/` — you should see `{"message":"Beacon API is running"}`.

---

## 3. Part 2 — Frontend on Vercel

### 3.1 Import the Project

1. Go to [https://vercel.com](https://vercel.com) and sign in.
2. Click **Add New → Project**.
3. Import the **Beacon** GitHub repository.
4. In the configuration screen:

| Field | Value |
|---|---|
| **Root Directory** | `frontend` |
| **Framework Preset** | Next.js (auto-detected) |
| **Build Command** | `npm run build` (default) |
| **Install Command** | `npm install` (default) |
| **Output Directory** | `.next` (default) |

### 3.2 Add Frontend Environment Variables

In the **Environment Variables** section, add all of the following before the first deploy.

#### Backend URL (Required)

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://beacon-api.onrender.com` — your Render service URL |

This is the only variable that connects the frontend to the backend. All API calls in `apiClient.ts` use this value.

#### Firebase Client SDK (Required — all 6 values)

These are **public** values safe to expose in the browser. Find them at:
**Firebase Console → Project Settings → Your apps → Web app → Config**

| Key | Example Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSy...` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `your-project` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `123456789012` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:123456789012:web:abc123def456` |

#### Firebase Admin SDK (Required — 3 values, server-only)

These are **private** and only used in Next.js API routes (never sent to the browser).

Find/generate them at:
**Firebase Console → Project Settings → Service Accounts → Generate new private key**

Download the JSON file. Extract the three values:

| Key | Where to find it in the JSON |
|---|---|
| `FIREBASE_ADMIN_PROJECT_ID` | `project_id` field |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | `client_email` field |
| `FIREBASE_ADMIN_PRIVATE_KEY` | `private_key` field — **read formatting note below** |

**FIREBASE_ADMIN_PRIVATE_KEY formatting:**

The downloaded JSON contains the key with literal `\n` characters. When pasting into Vercel, paste the **full raw value including the header and footer**, wrapped in double quotes:

```
"-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBg...\n-----END PRIVATE KEY-----\n"
```

Vercel will preserve the `\n` escapes and the Admin SDK will parse them correctly at runtime.

### 3.3 Deploy

Click **Deploy**. Vercel will run `npm install && npm run build`.

The first build takes 2–3 minutes. After it completes, your frontend is live at `https://your-project.vercel.app`.

### 3.4 Custom Domain (Optional)

In your Vercel project → **Settings → Domains**, add your custom domain and update its DNS records as instructed by Vercel.

---

## 4. Part 3 — Firebase Setup

If you do not already have a Firebase project:

### 4.1 Create a Project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com).
2. Click **Add project** → name it (e.g. `beacon-prod`).
3. Disable Google Analytics if not needed → **Create project**.

### 4.2 Enable Authentication

1. In the left sidebar → **Build → Authentication**.
2. Click **Get started**.
3. Under **Sign-in method**, enable **Email/Password**.
4. Save.

### 4.3 Enable Firestore

1. In the left sidebar → **Build → Firestore Database**.
2. Click **Create database**.
3. Select **Start in production mode** (the app handles its own rules).
4. Choose a region close to your users.
5. Click **Done**.

### 4.4 Get Client Config Values

1. **Project Settings** (gear icon) → **General → Your apps**.
2. If no app exists, click **Add app → Web**.
3. Register the app (name it anything).
4. Copy the `firebaseConfig` object — these are your 6 `NEXT_PUBLIC_FIREBASE_*` values.

### 4.5 Generate Service Account Key

1. **Project Settings → Service accounts**.
2. Select **Firebase Admin SDK** → **Node.js**.
3. Click **Generate new private key** → confirm → download the JSON.
4. Extract `project_id`, `client_email`, and `private_key` for the 3 Admin SDK env vars.

> Store this JSON securely and do **not** commit it to the repository.

---

## 5. Part 4 — Slack OAuth Setup

Only required if you want to use the Slack integration to ingest channel messages.

### 5.1 Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps).
2. Click **Create New App → From scratch**.
3. Name it `Beacon` and select your workspace.

### 5.2 Configure OAuth

1. In the left sidebar → **OAuth & Permissions**.
2. Under **Redirect URLs**, click **Add New Redirect URL**:
   ```
   https://beacon-api.onrender.com/integrations/slack/auth/callback
   ```
   Replace with your actual Render URL.
3. Click **Save URLs**.

### 5.3 Add Bot Token Scopes

Under **Scopes → Bot Token Scopes**, add:
- `channels:read`
- `channels:history`
- `users:read`

### 5.4 Get Credentials

1. In the left sidebar → **Basic Information → App Credentials**.
2. Copy **Client ID** → Render env var `SLACK_CLIENT_ID`.
3. Copy **Client Secret** → Render env var `SLACK_CLIENT_SECRET`.

### 5.5 Install to Workspace (for testing)

1. **Install App → Install to Workspace** → Allow.
2. Use the **Bot User OAuth Token** if you need to test direct API calls.

---

## 6. Part 5 — Groq API Key

1. Go to [https://console.groq.com](https://console.groq.com) and sign in (free account available).
2. Navigate to **API Keys → Create API Key**.
3. Copy the key (starts with `gsk_`).
4. Set it as both `GROQ_API_KEY` and `GROQ_CLOUD_API` in Render.

The application uses `llama-3.1-8b-instant` which is available on Groq's free tier.

---

## 7. Part 6 — Database Provisioning

The backend requires PostgreSQL. Three options:

### Option A — Render Postgres (Easiest)

1. In Render → **New → PostgreSQL**.
2. Name it `beacon-db`, choose the same region as your web service.
3. Select the **Free** or **Starter** plan.
4. After creation, open the database → **Connection → Internal Database URL**.
5. The URL format is:
   ```
   postgresql://user:password@host:5432/dbname
   ```
6. Split it into the 5 individual env vars for your web service:
   - `DB_HOST` → the hostname after `@`
   - `DB_PORT` → `5432`
   - `DB_NAME` → the database name (last path segment)
   - `DB_USER` → the user before `:`
   - `DB_PASS` → the password between `:` and `@`

> Use the **Internal** URL (not External) when both the database and web service are on Render in the same region — this avoids egress fees.

### Option B — Supabase (Generous free tier)

1. Go to [https://supabase.com](https://supabase.com) → **New project**.
2. **Project Settings → Database → Connection string → URI** (use the URI to extract host/user/pass/name).
3. Set `DB_HOST` to the host from the connection string (format: `db.xxxxx.supabase.co`).
4. Set `DB_PORT` to `5432`, `DB_NAME` to `postgres`, and fill in user/pass from the Project settings.

### Option C — Neon (Serverless Postgres, free tier)

1. Go to [https://neon.tech](https://neon.tech) → **New project**.
2. Under **Connection Details**, copy the host, user, password, and database name.
3. Set `DB_PORT` to `5432`.

### SQLite Fallback (Development only)

If none of the DB env vars are set or Postgres is unreachable, the backend automatically falls back to SQLite at `backend/brd_module/aks_storage.db`. This is suitable for local development but **not recommended for production** — data is stored inside the container and is lost on redeploy.

---

## 8. Part 7 — Connect Everything

After completing Parts 1–6, update these cross-service variables:

### In Render (Backend)

| Variable | Set to |
|---|---|
| `BACKEND_PUBLIC_URL` | Your Render service URL — `https://beacon-api.onrender.com` |
| `FRONTEND_URL` | Your Vercel URL — `https://your-project.vercel.app` |

### In Vercel (Frontend)

| Variable | Set to |
|---|---|
| `NEXT_PUBLIC_API_URL` | Your Render service URL — `https://beacon-api.onrender.com` |

After updating variables, trigger a redeploy:
- **Render:** Dashboard → your service → **Manual Deploy → Deploy latest commit**
- **Vercel:** Dashboard → your project → **Deployments → Redeploy**

---

## 9. Part 8 — Post-Deploy Smoke Test

Run through this checklist to confirm the deployment is healthy:

| Step | What to verify |
|---|---|
| 1. Open `https://your-project.vercel.app` | Landing page loads without console errors |
| 2. Register a new account | Firebase Auth creates user, cookie set, redirected to `/dashboard` |
| 3. Create a new session | Session appears in dashboard, `session_id` returned from backend |
| 4. Run Demo Ingestion | Click **Run Demo** on `/ingestion` — streaming log appears, chunks classified |
| 5. Check Signals page | Active signals visible, suppressed noise visible |
| 6. Generate BRD | Click **Generate BRD** — all 7 sections appear after ~30–60 seconds |
| 7. Review validation flags | Any flags appear under the relevant section |
| 8. Export as DOCX | `.docx` file downloads successfully |
| 9. Invite a teammate | Invite link generated and board accessible via `/invite/[token]` |
| 10. (Optional) Connect Slack | OAuth flow completes, channels listed |

---

## 10. Troubleshooting

### Backend returns 500 on `/brd/generate`

- Check Render logs for `GROQ_API_KEY` or `GROQ_CLOUD_API` missing errors.
- Verify both variables are set and the key is valid (test at [console.groq.com](https://console.groq.com)).

### Database connection error on startup

- Confirm all 5 `DB_*` variables are set correctly in Render.
- If using Render Postgres, ensure both services are in the **same region**.
- Check that the database instance is not in a sleeping state (free tier sleeps after inactivity).

### Frontend shows "Failed to fetch" errors

- Confirm `NEXT_PUBLIC_API_URL` in Vercel points to your live Render URL (not `localhost`).
- Check CORS: the backend's `allow_origins` is set to `["*"]` by default — no changes needed.
- Check that your Render service is not sleeping (free tier sleeps after 15 minutes of inactivity).

### Firebase session cookie issues / redirect loops

- Confirm all 3 `FIREBASE_ADMIN_*` variables are set in Vercel.
- Confirm `FIREBASE_ADMIN_PRIVATE_KEY` is wrapped in double quotes and uses `\n` for newlines.
- In Firebase Console, ensure Email/Password sign-in is enabled under Authentication.

### WeasyPrint / PDF export fails

- If you are NOT using Docker on Render, WeasyPrint will fail — switch to Docker runtime.
- The Dockerfile installs all required system libraries automatically.

### Slack OAuth "redirect_uri_mismatch"

- The redirect URI in your Slack app must **exactly** match:
  `https://beacon-api.onrender.com/integrations/slack/auth/callback`
  (no trailing slash, correct subdomain).
- Set `SLACK_REDIRECT_URI` in Render if you need to override the auto-derived value.

### Render service keeps restarting

- Check the Dockerfile: CMD is `uvicorn api.main:app --host 0.0.0.0 --port 8000 --workers 1`.
- Check for import errors in Render logs — usually caused by a missing env var.

---

<div align="center">

Need help? Open an issue on [GitHub](https://github.com/simplysandeepp/Beacon/issues).

</div>
