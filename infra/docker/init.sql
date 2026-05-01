-- OTO Database Init Script
-- Runs on first PostgreSQL container start

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id VARCHAR(100) NOT NULL,
    title VARCHAR(500),
    poster VARCHAR(1000),
    platform VARCHAR(100),
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, content_id)
);

CREATE TABLE IF NOT EXISTS content_cache (
    id VARCHAR(100) PRIMARY KEY,
    data JSONB NOT NULL,
    provider VARCHAR(20) DEFAULT 'omdb',
    cached_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_content_cache_expires ON content_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Cleanup function for expired cache
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
  DELETE FROM content_cache WHERE expires_at < NOW();
$$ LANGUAGE SQL;
