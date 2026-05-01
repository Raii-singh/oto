# OTOwire-Lite 🎬
> **OTO — Over the Over** | Cloud-Native OTT Aggregator Platform

A production-grade microservices OTT aggregator that lets users search, discover and redirect to content across Netflix, Prime Video, Hotstar, Zee5, SonyLIV and JioCinema — powered by OMDb API with TMDB fallback.

---

## 🏗️ Architecture

```
Browser
  ↓
NGINX (Port 80) ← Rate limiting, routing
  ↓
┌──────────────────────────────────────────────────┐
│ Frontend: Next.js (Port 3000)                    │
│   /api/* routes → proxy to backend services      │
└──────────────────────────────────────────────────┘
         ↓              ↓              ↓
  Content Service  Auth Service  Watchlist Service
  (Port 3001)      (Port 3002)   (Port 3003)
       ↓                ↓              ↓
     Redis           PostgreSQL    PostgreSQL
  (OMDb cache)       (users)      (watchlist)
       ↓
  OMDb API → TMDB (fallback)
```

## 🚀 Quick Start

### Development (without Docker)

**1. Start Content Service:**
```bash
cd services/content-service
npm install
npm run dev       # runs on :3001
```

**2. Start Auth Service:**
```bash
cd services/auth-service
npm install
npm run dev       # runs on :3002
```

**3. Start Watchlist Service:**
```bash
cd services/watchlist-service
npm install
npm run dev       # runs on :3003
```

**4. Start Frontend:**
```bash
cd frontend
npm install
npm run dev       # runs on :3000
```

### Full Stack with Docker Compose

```bash
# Set env vars
cp .env.example .env
# Edit .env with your API keys

# Build and start all services
docker compose up -d

# View logs
docker compose logs -f content-service
```

**Services will be available at:**
| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Content API | http://localhost:3001 |
| Auth API | http://localhost:3002 |
| Watchlist API | http://localhost:3003 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3030 (admin/oto_grafana) |
| NGINX Gateway | http://localhost:80 |

---

## ⚙️ Environment Variables

### `services/content-service/.env`
```env
CONTENT_API_PROVIDER=omdb        # "omdb" (primary) or "tmdb" (fallback)
OMDB_API_KEY=bec831df
TMDB_API_KEY=                    # Optional fallback
REDIS_URL=redis://localhost:6379
```

### `services/auth-service/.env`
```env
JWT_SECRET=your_secret_here
DB_HOST=localhost
DB_NAME=otowire
DB_USER=oto
DB_PASSWORD=otopassword
```

### `frontend/.env.local`
```env
CONTENT_SERVICE_URL=http://localhost:3001
NEXT_PUBLIC_API_BASE_URL=http://localhost:3002
```

---

## 🔗 API Endpoints

### Content Service (`:3001`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/content/trending` | Trending content (Redis cached 30min) |
| GET | `/content/search?q=query` | Search titles (cached 5min) |
| GET | `/content/:id` | Content detail by IMDb/TMDB id (cached 24h) |
| GET | `/health` | Service health check |
| GET | `/metrics` | Prometheus metrics |

### Auth Service (`:3002`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/signup` | Register new user |
| POST | `/auth/login` | Login, returns JWT |

### Watchlist Service (`:3003`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/watchlist` | Get user watchlist (JWT required) |
| POST | `/watchlist` | Add item to watchlist |
| DELETE | `/watchlist/:contentId` | Remove item |

---

## 🐳 Docker

```bash
# Build individual service
docker build -t oto-content ./services/content-service

# Full stack
docker compose up -d

# View running containers
docker compose ps
```

## 📊 Monitoring

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3030
  - Username: `admin` | Password: `oto_grafana`
  - Dashboards auto-provisioned

## 🔄 CI/CD (GitHub Actions)

Pipeline: `push → typecheck → build → docker image → deploy to EC2`

Required GitHub Secrets:
- `OMDB_API_KEY`, `TMDB_API_KEY`, `JWT_SECRET`
- `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`

---

## 📁 Project Structure

```
OTO/
├── frontend/                    # Next.js 15 App Router
│   ├── app/
│   │   ├── api/                 # Backend proxy routes
│   │   │   ├── trending/        # → content-service
│   │   │   ├── search/          # → content-service
│   │   │   └── content/[id]/    # → content-service
│   │   ├── search/              # Browse page
│   │   ├── content/[id]/        # Detail page
│   │   ├── watchlist/           # Watchlist page
│   │   └── auth/                # Login / Signup
│   └── components/              # Navbar, Hero, ContentCard...
├── services/
│   ├── content-service/         # OMDb + Redis cache (:3001)
│   ├── auth-service/            # JWT + PostgreSQL (:3002)
│   └── watchlist-service/       # Watchlist + PostgreSQL (:3003)
├── infra/
│   ├── docker/init.sql          # PostgreSQL schema
│   ├── nginx/nginx.conf         # Reverse proxy + rate limiting
│   └── monitoring/              # Prometheus + Grafana
├── .github/workflows/ci.yml     # GitHub Actions CI/CD
└── docker-compose.yml           # Full stack orchestration
```
