import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import client from 'prom-client';

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'otowire',
  user: process.env.DB_USER || 'oto',
  password: process.env.DB_PASSWORD || 'otopassword',
});

// Init watchlist table
pool.query(`
  CREATE TABLE IF NOT EXISTS watchlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    content_id VARCHAR(50) NOT NULL,
    title VARCHAR(500),
    poster VARCHAR(1000),
    platform VARCHAR(100),
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, content_id)
  )
`).catch(err => console.warn('[DB] Watchlist init:', err.message));

const JWT_SECRET = process.env.JWT_SECRET || 'oto_super_secret_jwt_key_change_in_production';

// ── Prometheus ───────────────────────────────────────────
client.collectDefaultMetrics({ prefix: 'oto_watchlist_' });
const wlCounter = new client.Counter({
  name: 'oto_watchlist_requests_total',
  help: 'Watchlist requests',
  labelNames: ['route', 'method'],
});
const register = client.register;

// ── Auth Middleware ──────────────────────────────────────
interface AuthRequest extends Request { userId?: number; }

const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET) as { userId: number };
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ── Routes ───────────────────────────────────────────────

// GET /watchlist — get user's watchlist
app.get('/watchlist', authMiddleware, async (req: AuthRequest, res: Response) => {
  wlCounter.inc({ route: 'watchlist', method: 'GET' });
  try {
    const result = await pool.query(
      'SELECT * FROM watchlist WHERE user_id = $1 ORDER BY added_at DESC',
      [req.userId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch watchlist' });
  }
});

// POST /watchlist — add item
app.post('/watchlist', authMiddleware, async (req: AuthRequest, res: Response) => {
  wlCounter.inc({ route: 'watchlist', method: 'POST' });
  const { contentId, title, poster, platform } = req.body;
  if (!contentId) return res.status(400).json({ success: false, message: 'contentId is required' });
  try {
    const result = await pool.query(
      `INSERT INTO watchlist (user_id, content_id, title, poster, platform)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, content_id) DO NOTHING
       RETURNING *`,
      [req.userId, contentId, title, poster, platform]
    );
    return res.status(201).json({ success: true, data: result.rows[0] || null, message: 'Added to watchlist' });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to add to watchlist' });
  }
});

// DELETE /watchlist/:contentId — remove item
app.delete('/watchlist/:contentId', authMiddleware, async (req: AuthRequest, res: Response) => {
  wlCounter.inc({ route: 'watchlist', method: 'DELETE' });
  try {
    await pool.query(
      'DELETE FROM watchlist WHERE user_id = $1 AND content_id = $2',
      [req.userId, req.params.contentId]
    );
    return res.json({ success: true, message: 'Removed from watchlist' });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to remove from watchlist' });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'watchlist-service' }));
app.get('/metrics', async (_req, res) => { res.set('Content-Type', register.contentType); res.end(await register.metrics()); });

app.listen(PORT, () => console.log(`✅ Watchlist Service running on :${PORT}`));
export default app;
