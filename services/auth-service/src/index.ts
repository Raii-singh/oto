import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import client from 'prom-client';

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// ── PostgreSQL ───────────────────────────────────────────
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'otowire',
  user: process.env.DB_USER || 'oto',
  password: process.env.DB_PASSWORD || 'otopassword',
});

// Init table
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(err => console.warn('[DB] Table init warning:', err.message));

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10');

// ── Prometheus ───────────────────────────────────────────
client.collectDefaultMetrics({ prefix: 'oto_auth_' });
const authCounter = new client.Counter({
  name: 'oto_auth_requests_total',
  help: 'Auth requests',
  labelNames: ['route', 'status'],
});
const register = client.register;

// ── Routes ───────────────────────────────────────────────

// POST /auth/signup
app.post('/auth/signup', async (req, res) => {
  authCounter.inc({ route: 'signup', status: 'attempt' });
  const { name, email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }
  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length) {
      authCounter.inc({ route: 'signup', status: 'conflict' });
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }
    const hash = await bcrypt.hash(password, ROUNDS);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name',
      [name || null, email, hash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    authCounter.inc({ route: 'signup', status: 'success' });
    return res.status(201).json({ success: true, token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    authCounter.inc({ route: 'signup', status: 'error' });
    console.error('[Auth] Signup error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /auth/login
app.post('/auth/login', async (req, res) => {
  authCounter.inc({ route: 'login', status: 'attempt' });
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!result.rows.length) {
      authCounter.inc({ route: 'login', status: 'not_found' });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      authCounter.inc({ route: 'login', status: 'invalid_password' });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    authCounter.inc({ route: 'login', status: 'success' });
    return res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    authCounter.inc({ route: 'login', status: 'error' });
    console.error('[Auth] Login error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /health
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));

// GET /metrics
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(PORT, () => console.log(`✅ Auth Service running on :${PORT}`));
export default app;
