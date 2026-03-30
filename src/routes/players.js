// src/routes/players.js
// Public  : GET /api/players, GET /api/players/:id
// Admin   : POST, PUT, DELETE

const express = require('express');
const pool    = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/* GET /api/players  ?category=senior|junior */
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    let query  = 'SELECT * FROM players';
    const params = [];
    if (category) {
      query += ' WHERE category = $1';
      params.push(category);
    }
    query += ' ORDER BY jersey_number ASC NULLS LAST, id ASC';
    const result = await pool.query(query, params);
    return res.status(200).json({ players: result.rows });
  } catch (err) {
    console.error('players GET error:', err.message);
    return res.status(500).json({ error: 'Could not fetch players.' });
  }
});

/* GET /api/players/:id */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid player ID.' });
    const result = await pool.query('SELECT * FROM players WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Player not found.' });
    return res.status(200).json({ player: result.rows[0] });
  } catch (err) {
    console.error('player GET error:', err.message);
    return res.status(500).json({ error: 'Could not fetch player.' });
  }
});

/* POST /api/players  (admin) */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      fullName, nickname, dateOfBirth, position, jerseyNumber,
      category, apps, goals, assists, bio, profileImageUrl, nationality,
    } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ error: 'Full name is required.' });
    }

    const result = await pool.query(
      `INSERT INTO players
         (full_name, nickname, date_of_birth, position, jersey_number,
          category, apps, goals, assists, bio, profile_image_url, nationality, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        fullName.trim(),
        nickname        || null,
        dateOfBirth     || null,
        position        || null,
        jerseyNumber    || null,
        category        || 'senior',
        apps            || 0,
        goals           || 0,
        assists         || 0,
        bio             || null,
        profileImageUrl || null,
        nationality     || 'Pakistani',
        req.user.id,
      ]
    );
    return res.status(201).json({ player: result.rows[0] });
  } catch (err) {
    console.error('player POST error:', err.message);
    return res.status(500).json({ error: 'Could not create player.' });
  }
});

/* PUT /api/players/:id  (admin) */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid player ID.' });

    const {
      fullName, nickname, dateOfBirth, position, jerseyNumber,
      category, apps, goals, assists, bio, profileImageUrl, nationality,
    } = req.body;

    const result = await pool.query(
      `UPDATE players SET
         full_name         = COALESCE($1,  full_name),
         nickname          = COALESCE($2,  nickname),
         date_of_birth     = COALESCE($3,  date_of_birth),
         position          = COALESCE($4,  position),
         jersey_number     = COALESCE($5,  jersey_number),
         category          = COALESCE($6,  category),
         apps              = COALESCE($7,  apps),
         goals             = COALESCE($8,  goals),
         assists           = COALESCE($9,  assists),
         bio               = COALESCE($10, bio),
         profile_image_url = COALESCE($11, profile_image_url),
         nationality       = COALESCE($12, nationality),
         updated_at        = NOW()
       WHERE id = $13
       RETURNING *`,
      [
        fullName        || null,
        nickname        || null,
        dateOfBirth     || null,
        position        || null,
        jerseyNumber    || null,
        category        || null,
        apps        != null ? apps    : null,
        goals       != null ? goals   : null,
        assists     != null ? assists : null,
        bio             || null,
        profileImageUrl || null,
        nationality     || null,
        id,
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Player not found.' });
    return res.status(200).json({ player: result.rows[0] });
  } catch (err) {
    console.error('player PUT error:', err.message);
    return res.status(500).json({ error: 'Could not update player.' });
  }
});

/* DELETE /api/players/:id  (admin) */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid player ID.' });
    const result = await pool.query('DELETE FROM players WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Player not found.' });
    return res.status(200).json({ message: 'Player deleted.' });
  } catch (err) {
    console.error('player DELETE error:', err.message);
    return res.status(500).json({ error: 'Could not delete player.' });
  }
});

module.exports = router;
