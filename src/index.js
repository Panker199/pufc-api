// src/index.js
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const initDB    = require('./db/init');
const pool      = require('./db/pool');

const authRoutes   = require('./routes/auth');
const playerRoutes = require('./routes/players');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Trust proxy (Railway / Render sit behind a reverse proxy) ── */
app.set('trust proxy', 1);

/* ── CORS ─────────────────────────────────────────────────────── */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin)                           return cb(null, true); // same-origin / curl / mobile
    if (ALLOWED_ORIGINS.length === 0)      return cb(null, true); // no restriction set → allow all
    if (ALLOWED_ORIGINS.includes('*'))     return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin))  return cb(null, true);
    return cb(new Error(`CORS: origin ${origin} not allowed`), false);
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/* ── Body parsers ─────────────────────────────────────────────── */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

/* ── Global rate limiter ──────────────────────────────────────── */
app.use(rateLimit({
  windowMs:       15 * 60 * 1000, // 15 min
  max:            200,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { error: 'Too many requests. Please wait and try again.' },
}));

/* ── Auth-specific rate limiter (stricter) ────────────────────── */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { error: 'Too many auth attempts. Please wait 15 minutes.' },
});
app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/signup',          authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

/* ── Health check ─────────────────────────────────────────────── */
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({
      status:  'ok',
      service: 'Pak United FC API',
      time:    new Date().toISOString(),
      env:     process.env.NODE_ENV || 'development',
    });
  } catch (err) {
    res.status(503).json({
      status:  'db_error',
      service: 'Pak United FC API',
      time:    new Date().toISOString(),
    });
  }
});

/* ── API Routes ───────────────────────────────────────────────── */
app.use('/api/auth',    authRoutes);
app.use('/api/players', playerRoutes);

/* ── 404 handler ──────────────────────────────────────────────── */
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

/* ── Global error handler ─────────────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

/* ── Boot ─────────────────────────────────────────────────────── */
async function start() {
  try {
    await initDB();
  } catch (err) {
    console.error('❌ DB initialization failed:', err.message);
    process.exit(1);
  }

  // Purge expired sessions every 6 hours
  setInterval(() => {
    pool.query('DELETE FROM sessions WHERE expires_at < NOW()')
      .catch(err => console.error('Session cleanup error:', err.message));
  }, 6 * 60 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`\n🚀 Pak United FC API running on port ${PORT}`);
    console.log(`   Health:  http://localhost:${PORT}/health`);
    console.log(`   Auth:    http://localhost:${PORT}/api/auth/*`);
    console.log(`   Players: http://localhost:${PORT}/api/players\n`);
  });
}

start().catch(err => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
