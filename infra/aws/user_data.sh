#!/bin/bash
# EC2 User Data — runs on first boot, installs Docker, pulls images, starts services
set -e

# ── Install Docker ───────────────────────────────────────
yum update -y
yum install -y docker git
systemctl enable docker
systemctl start docker
usermod -a -G docker ec2-user

# ── Install Docker Compose ───────────────────────────────
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# ── Login to ECR ─────────────────────────────────────────
aws ecr get-login-password --region ${aws_region} | \
  docker login --username AWS --password-stdin ${ecr_registry}

# ── Write environment file ───────────────────────────────
mkdir -p /opt/otowire
cat > /opt/otowire/.env << EOF
OMDB_API_KEY=${omdb_api_key}
JWT_SECRET=${jwt_secret}
CONTENT_API_PROVIDER=omdb
DB_HOST=${db_host}
DB_PORT=5432
DB_NAME=otowire
DB_USER=oto
DB_PASSWORD=${db_password}
REDIS_URL=redis://${redis_host}:6379
ECR_REGISTRY=${ecr_registry}
EOF

# ── Write docker-compose for production (uses ECR images) ─
cat > /opt/otowire/docker-compose.yml << 'COMPOSE'
version: '3.9'
services:
  content-service:
    image: ${ECR_REGISTRY}/otowire/content-service:latest
    ports: ["3001:3001"]
    env_file: .env
    environment:
      PORT: "3001"
      REDIS_URL: redis://${REDIS_HOST}:6379
    restart: unless-stopped

  auth-service:
    image: ${ECR_REGISTRY}/otowire/auth-service:latest
    ports: ["3002:3002"]
    env_file: .env
    environment:
      PORT: "3002"
    restart: unless-stopped

  watchlist-service:
    image: ${ECR_REGISTRY}/otowire/watchlist-service:latest
    ports: ["3003:3003"]
    env_file: .env
    environment:
      PORT: "3003"
    restart: unless-stopped

  frontend:
    image: ${ECR_REGISTRY}/otowire/frontend:latest
    ports: ["3000:3000"]
    env_file: .env
    environment:
      CONTENT_SERVICE_URL: http://localhost:3001
      NEXT_PUBLIC_API_BASE_URL: http://localhost:3002
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports: ["80:80"]
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on: [frontend, content-service, auth-service, watchlist-service]
    restart: unless-stopped
COMPOSE

# ── Start services ───────────────────────────────────────
cd /opt/otowire
docker-compose pull
docker-compose up -d

echo "OTOwire-Lite deployed successfully on AWS EC2 ✅"
