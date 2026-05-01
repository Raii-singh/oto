import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import contentRouter from './routes/content';
import { register } from './metrics';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Routes ──────────────────────────────────────────────
app.use('/content', contentRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'content-service',
    provider: process.env.CONTENT_API_PROVIDER || 'omdb',
    timestamp: new Date().toISOString(),
  });
});

// Prometheus metrics endpoint
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Content Service running on :${PORT}`);
  console.log(`   Provider: ${process.env.CONTENT_API_PROVIDER || 'omdb'}`);
  console.log(`   TMDB fallback: ${process.env.TMDB_API_KEY ? 'enabled' : 'disabled'}`);
});

export default app;
