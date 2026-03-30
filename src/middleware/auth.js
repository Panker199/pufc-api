// src/middleware/auth.js
const jwt  = require('jsonwebtoken');
const pool = require('../db/pool');

const JWT_SECRET = process.env.JWT_SECRET || 'pufc_change_me_in_production';

/**
 * requireAuth — verifies Bearer JWT and checks active DB session.
 * Attaches req.user = { id, email, role, firstName, lastName }
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers['authorization'] || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Token expired or invalid. Please log in again.' });
    }

    // Validate session is still alive in DB (handles explicit logout invalidation)
    const sess = await pool.query(
      `SELECT id FROM sessions
       WHERE session_token = $1
         AND expires_at    > NOW()
         AND user_id       = $2`,
      [token, payload.id]
    );

    if (sess.rowCount === 0) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }

    req.user  = payload;
    req.token = token;
    next();
  } catch (err) {
    console.error('requireAuth error:', err.message);
    return res.status(500).json({ error: 'Internal auth error.' });
  }
}

/**
 * requireAdmin — must be used after requireAuth.
 */
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required.' });
}

module.exports = { requireAuth, requireAdmin, JWT_SECRET };
