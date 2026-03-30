// src/db/init.js
// Runs once on startup to ensure all required tables exist.
const pool = require('./pool');

const SCHEMA = `
-- Users
CREATE TABLE IF NOT EXISTS users (
    id               SERIAL PRIMARY KEY,
    username         VARCHAR(50) UNIQUE,
    email            VARCHAR(100) UNIQUE NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    first_name       VARCHAR(50),
    last_name        VARCHAR(50),
    phone_number     VARCHAR(20),
    playing_position VARCHAR(50),
    role             VARCHAR(20) DEFAULT 'fan',
    is_verified      BOOLEAN DEFAULT FALSE,
    last_login       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id             SERIAL PRIMARY KEY,
    user_id        INT REFERENCES users(id) ON DELETE CASCADE,
    session_token  VARCHAR(512) UNIQUE NOT NULL,
    ip_address     VARCHAR(50),
    user_agent     TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    expires_at     TIMESTAMPTZ NOT NULL
);

-- Password Resets
CREATE TABLE IF NOT EXISTS password_resets (
    id          SERIAL PRIMARY KEY,
    user_id     INT REFERENCES users(id) ON DELETE CASCADE,
    reset_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
    id                 SERIAL PRIMARY KEY,
    action_by          INT REFERENCES users(id) ON DELETE SET NULL,
    action_type        VARCHAR(100) NOT NULL,
    action_description TEXT,
    ip_address         VARCHAR(50),
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Players
CREATE TABLE IF NOT EXISTS players (
    id                SERIAL PRIMARY KEY,
    full_name         VARCHAR(100) NOT NULL,
    nickname          VARCHAR(50),
    date_of_birth     DATE,
    position          VARCHAR(50),
    jersey_number     VARCHAR(5),
    category          VARCHAR(30) DEFAULT 'senior',
    apps              INT DEFAULT 0,
    goals             INT DEFAULT 0,
    assists           INT DEFAULT 0,
    bio               TEXT,
    profile_image_url TEXT,
    nationality       VARCHAR(50) DEFAULT 'Pakistani',
    created_by        INT REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email           ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_token        ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user         ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(reset_token);
CREATE INDEX IF NOT EXISTS idx_players_category      ON players(category);
`;

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(SCHEMA);
    console.log('✅ Database schema verified / initialized');

    // Clean up expired sessions on every boot
    await client.query('DELETE FROM sessions WHERE expires_at < NOW()');
    console.log('✅ Expired sessions cleaned up');
  } catch (err) {
    console.error('❌ Schema init failed:', err.message);
    throw err; // Let the caller decide whether to exit
  } finally {
    client.release();
  }
}

module.exports = initDB;
