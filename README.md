# Pak United FC — API Deployment Guide

## What's in this project

```
pufc-api/
├── src/
│   ├── index.js          ← Express app entry point
│   ├── db/
│   │   ├── pool.js       ← PostgreSQL connection pool
│   │   └── init.js       ← Auto-creates tables on first boot
│   ├── middleware/
│   │   └── auth.js       ← JWT Bearer token verification
│   └── routes/
│       ├── auth.js       ← /api/auth/* (signup, login, logout, me, reset)
│       └── players.js    ← /api/players/* (public read, admin write)
├── .env.example          ← Environment variables template
├── railway.json          ← Railway deployment config
└── package.json
```

---

## STEP 1 — Get your Render DB connection string

1. Go to https://dashboard.render.com
2. Click your PostgreSQL database **PUFC**
3. Click **"Connect"** → copy the **External Database URL**
   - Looks like: `postgresql://pufc_user:PASSWORD@dpg-xxxx.oregon-postgres.render.com/PUFC`

---

## STEP 2 — Deploy to Railway

### Option A — GitHub (recommended)

1. Push this folder to a new GitHub repo:
   ```bash
   cd pufc-api
   git init
   git add .
   git commit -m "Initial PUFC API"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/pufc-api.git
   git push -u origin main
   ```

2. Go to https://railway.app → **New Project** → **Deploy from GitHub repo**
3. Select your repo → Railway will auto-detect Node.js

### Option B — Railway CLI

```bash
npm install -g @railway/cli
railway login
cd pufc-api
railway init
railway up
```

---

## STEP 3 — Set Environment Variables on Railway

In your Railway project → **Variables** tab → add these:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your Render external DB URL from Step 1 |
| `JWT_SECRET` | Any long random string (32+ chars) |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGINS` | `https://pakunitedfc.blogspot.com` |
| `SMTP_USER` | `muhmmadmuneebalam@gmail.com` |
| `SMTP_PASS` | gnhx aazg ppwc zhoc |
| `APP_URL` | https://pakunitedfc.blogspot.com |

### Generate a strong JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Gmail App Password (for reset emails):
1. Go to Google Account → Security → 2-Step Verification (enable it)
2. Then: Security → App Passwords → Generate one for "Mail"
3. Use that 16-character password as `SMTP_PASS`

---

## STEP 4 — Get your Railway URL

After deploy, Railway gives you a public URL like:
```
https://pufc-api-production.up.railway.app
```

Go to Railway project → **Settings** → **Domains** to find/set it.

---

## STEP 5 — Update your Blogger template

Find this line in your Blogger XML template (around line 650):

```javascript
var API_BASE = 'YOUR_RAILWAY_API_URL';
```

Replace with your actual Railway URL:

```javascript
var API_BASE = 'https://pufc-api-production.up.railway.app';
```

---

## STEP 6 — Test the API

Open your browser or use curl:

```bash
# Health check
curl https://YOUR_RAILWAY_URL/health

# Test signup
curl -X POST https://YOUR_RAILWAY_URL/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"User","email":"test@test.com","password":"Test1234","role":"fan"}'

# Test login
curl -X POST https://YOUR_RAILWAY_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test1234"}'
```

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Health check |
| POST | `/api/auth/signup` | No | Create account |
| POST | `/api/auth/login` | No | Login |
| POST | `/api/auth/logout` | Bearer | Logout |
| GET | `/api/auth/me` | Bearer | Get current user |
| POST | `/api/auth/forgot-password` | No | Request reset email |
| POST | `/api/auth/reset-password` | No | Reset with token |
| GET | `/api/auth/sessions` | Bearer | List active sessions |
| GET | `/api/players` | No | List players |
| GET | `/api/players/:id` | No | Single player |
| POST | `/api/players` | Admin | Add player |
| PUT | `/api/players/:id` | Admin | Update player |
| DELETE | `/api/players/:id` | Admin | Delete player |

---

## Rate Limits

- Global: 200 requests / 15 min per IP
- Login / Signup / Forgot-password: 20 requests / 15 min per IP

---

## Make yourself admin

After creating your account via signup, run this in pgAdmin:

```sql
UPDATE users
SET role = 'admin'
WHERE email = 'muhmmadmuneebalam@gmail.com';
```

---

## Troubleshooting

**"DB connection failed"** — Check `DATABASE_URL` is set correctly in Railway vars.

**"CORS error"** — Add your Blogger URL to `ALLOWED_ORIGINS` in Railway vars.

**"Token expired"** — JWT tokens last 7 days. User needs to log in again.

**Reset emails not sending** — Check `SMTP_USER` and `SMTP_PASS` are set.
In dev (no SMTP vars), the token is printed to Railway logs instead.
