// src/routes/auth.js
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool       = require('../db/pool');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const JWT_EXPIRES_IN     = '7d';
const SESSION_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/* ── helpers ───────────────────────────────────────────── */
function sanitize(val) {
  return typeof val === 'string' ? val.trim() : '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function userPublic(u) {
  return {
    id:         u.id,
    email:      u.email,
    firstName:  u.first_name,
    lastName:   u.last_name,
    role:       u.role,
    position:   u.playing_position || null,
    isVerified: u.is_verified,
  };
}

async function createSession(userId, token, req) {
  const expiresAt = new Date(Date.now() + SESSION_EXPIRES_MS);
  await pool.query(
    `INSERT INTO sessions (user_id, session_token, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      token,
      req.ip || null,
      req.headers['user-agent'] || null,
      expiresAt,
    ]
  );
}

async function auditLog(userId, type, desc, req) {
  try {
    await pool.query(
      `INSERT INTO audit_log (action_by, action_type, action_description, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [userId || null, type, desc, req?.ip || null]
    );
  } catch (_) {}
}

/* ══════════════════════════════════════════════════════════
   POST /api/auth/signup
══════════════════════════════════════════════════════════ */
router.post('/signup', async (req, res) => {
  try {
    const firstName = sanitize(req.body.firstName);
    const lastName  = sanitize(req.body.lastName);
    const email     = sanitize(req.body.email).toLowerCase();
    const password  = sanitize(req.body.password);
    const phone     = sanitize(req.body.phone)           || null;
    const position  = sanitize(req.body.playingPosition) || null;
    const role      = ['player', 'coach', 'fan', 'media'].includes(req.body.role)
                        ? req.body.role : 'fan';

    if (!firstName || !lastName)  return res.status(400).json({ error: 'First and last name are required.' });
    if (!isValidEmail(email))     return res.status(400).json({ error: 'Valid email is required.' });
    if (password.length < 8)      return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users
         (first_name, last_name, email, password_hash, phone_number, playing_position, role, is_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false)
       RETURNING *`,
      [firstName, lastName, email, passwordHash, phone, position, role]
    );
    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role,
        firstName: user.first_name, lastName: user.last_name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await createSession(user.id, token, req);
    await auditLog(user.id, 'SIGNUP', `New ${role} account: ${email}`, req);

    return res.status(201).json({ token, user: userPublic(user) });

  } catch (err) {
    console.error('signup error:', err.message);
    return res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
});

/* ══════════════════════════════════════════════════════════
   POST /api/auth/login
══════════════════════════════════════════════════════════ */
router.post('/login', async (req, res) => {
  try {
    const email    = sanitize(req.body.email).toLowerCase();
    const password = sanitize(req.body.password);

    if (!isValidEmail(email) || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = result.rows[0];

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await auditLog(user.id, 'LOGIN_FAILED', `Failed login: ${email}`, req);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role,
        firstName: user.first_name, lastName: user.last_name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await createSession(user.id, token, req);
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    await auditLog(user.id, 'LOGIN', `Successful login: ${email}`, req);

    return res.status(200).json({ token, user: userPublic(user) });

  } catch (err) {
    console.error('login error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

/* ══════════════════════════════════════════════════════════
   POST /api/auth/logout
══════════════════════════════════════════════════════════ */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM sessions WHERE session_token = $1', [req.token]);
    await auditLog(req.user.id, 'LOGOUT', `Logout: ${req.user.email}`, req);
    return res.status(200).json({ message: 'Logged out successfully.' });
  } catch (err) {
    console.error('logout error:', err.message);
    return res.status(500).json({ error: 'Logout failed.' });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/auth/me
══════════════════════════════════════════════════════════ */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found.' });
    return res.status(200).json({ user: userPublic(result.rows[0]) });
  } catch (err) {
    console.error('me error:', err.message);
    return res.status(500).json({ error: 'Could not fetch user.' });
  }
});

/* ══════════════════════════════════════════════════════════
   POST /api/auth/forgot-password
══════════════════════════════════════════════════════════ */
router.post('/forgot-password', async (req, res) => {
  try {
    const email = sanitize(req.body.email).toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required.' });
    }

    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

    // Always 200 to prevent email enumeration
    if (result.rowCount === 0) {
      return res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });
    }

    const userId    = result.rows[0].id;
    const token     = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate old tokens
    await pool.query(
      'UPDATE password_resets SET used = true WHERE user_id = $1 AND used = false',
      [userId]
    );
    await pool.query(
      'INSERT INTO password_resets (user_id, reset_token, expires_at) VALUES ($1,$2,$3)',
      [userId, token, expiresAt]
    );

    // Send email if SMTP is configured
    const SMTP_USER = process.env.SMTP_USER;
    const SMTP_PASS = process.env.SMTP_PASS;
    const APP_URL   = process.env.APP_URL || 'https://pakunitedfc.blogspot.com';

    if (SMTP_USER && SMTP_PASS) {
      try {
        const nodemailer  = require('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: SMTP_USER, pass: SMTP_PASS },
        });
        const resetLink = `${APP_URL}/p/reset-password.html?token=${token}`;
        await transporter.sendMail({
          from:    `"Pak United FC" <${SMTP_USER}>`,
          to:      email,
          subject: 'Reset your Pak United FC password',
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:auto">
              <h2 style="color:#01411C">Pak United FC</h2>
              <p>Click the button below to reset your password. This link expires in 1 hour.</p>
              <a href="${resetLink}"
                 style="display:inline-block;background:#CCFF00;color:#000;font-weight:700;
                        padding:14px 32px;text-decoration:none;border-radius:4px;margin:20px 0">
                Reset Password
              </a>
              <p style="font-size:12px;color:#666">If you didn't request this, you can safely ignore this email.</p>
            </div>`,
        });
      } catch (mailErr) {
        console.error('Email send failed:', mailErr.message);
        // Don't fail the request — token is still saved in DB
      }
    } else {
      // Dev fallback: print token to logs
      console.log(`[DEV] Password reset token for ${email}: ${token}`);
    }

    await auditLog(userId, 'FORGOT_PASSWORD', `Reset requested for ${email}`, req);
    return res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });

  } catch (err) {
    console.error('forgot-password error:', err.message);
    return res.status(500).json({ error: 'Request failed. Please try again.' });
  }
});

/* ══════════════════════════════════════════════════════════
   POST /api/auth/reset-password
══════════════════════════════════════════════════════════ */
router.post('/reset-password', async (req, res) => {
  try {
    const token    = sanitize(req.body.token);
    const password = sanitize(req.body.password);

    if (!token)              return res.status(400).json({ error: 'Reset token is required.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const result = await pool.query(
      `SELECT pr.*, u.email FROM password_resets pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.reset_token = $1
         AND pr.used        = false
         AND pr.expires_at  > NOW()`,
      [token]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const reset        = result.rows[0];
    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, reset.user_id]);
    await pool.query('UPDATE password_resets SET used = true WHERE id = $1', [reset.id]);

    // Invalidate all sessions so old tokens stop working
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [reset.user_id]);

    await auditLog(reset.user_id, 'RESET_PASSWORD', `Password reset for ${reset.email}`, req);
    return res.status(200).json({ message: 'Password reset successfully. Please log in.' });

  } catch (err) {
    console.error('reset-password error:', err.message);
    return res.status(500).json({ error: 'Reset failed. Please try again.' });
  }
});

/* ══════════════════════════════════════════════════════════
   GET /api/auth/sessions  (list active sessions)
══════════════════════════════════════════════════════════ */
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, ip_address, user_agent, created_at, expires_at
       FROM sessions
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.status(200).json({ sessions: result.rows });
  } catch (err) {
    console.error('sessions error:', err.message);
    return res.status(500).json({ error: 'Could not fetch sessions.' });
  }
});

module.exports = router;
