# Sederek Kasir Backend - Docker Deployment Guide

## Prerequisites

- VPS with Docker & Docker Compose installed
- Git installed on VPS
- Domain pointing to your VPS IP
- SSH access to VPS
- 4GB RAM, 2+ cores (recommended)

---

## Quick Start (5 minutes)

### 1. SSH into VPS

```bash
ssh user@your-vps-ip
```

### 2. Clone Repository

```bash
git clone https://github.com/your-org/sederek-kasir-backend.git
cd sederek-kasir-backend
```

### 3. Setup Environment File

```bash
# Copy production template
cp .env.production .env

# Edit with your settings
nano .env
```

**Required changes in .env:**

```bash
# Database password (STRONG PASSWORD!)
DB_PASSWORD=your_secure_db_password_here_32_chars_min

# JWT secrets (Generate with: openssl rand -base64 32)
JWT_SECRET=your_jwt_secret_here_32_chars
JWT_REFRESH_SECRET=your_refresh_secret_here_32_chars

# Your VPS domain
CORS_ORIGIN=https://your-domain.com
```

**Generate strong passwords:**

```bash
# Generate DB password
openssl rand -base64 32

# Generate JWT secret
openssl rand -base64 32

# Copy output to .env file
```

### 4. Build and Run

```bash
# Build Docker image and start services
docker-compose up -d

# Check if running
docker-compose ps

# Check API health
curl http://localhost:3000/health
```

### 5. Done! 🎉

Your API is running on:
- **HTTP:** `http://localhost:3000`
- **HTTPS:** `https://your-domain.com` (with Nginx setup)

---

## Verifying Everything Works

### Check Container Status

```bash
docker-compose ps
```

Expected output:
```
NAME                COMMAND             STATUS
sederek-kasir-api    node dist/server.js Up (healthy)
sederek-kasir-db     postgres            Up (healthy)
```

### Check Logs

```bash
# Backend logs
docker-compose logs -f app

# Database logs
docker-compose logs -f postgres

# View last 50 lines
docker-compose logs -n 50 app
```

### Test API Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Login (default credentials)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

---

## Managing Services

### View Running Containers

```bash
docker-compose ps
```

### View Logs

```bash
# Real-time logs for app
docker-compose logs -f app

# Real-time logs for database
docker-compose logs -f postgres

# Last 100 lines for app
docker-compose logs --tail=100 app
```

### Restart Services

```bash
# Restart app only
docker-compose restart app

# Restart postgres only
docker-compose restart postgres

# Restart everything
docker-compose restart
```

### Stop Services

```bash
docker-compose stop
```

### Start Services (if stopped)

```bash
docker-compose start
```

### Stop and Remove Everything

```bash
# Stop containers
docker-compose down

# Remove everything including volumes (WARNING: loses database!)
docker-compose down -v
```

---

## Database Management

### Access PostgreSQL CLI

```bash
docker-compose exec postgres psql -U postgres -d sederek_kasir
```

### Useful PostgreSQL Commands

```sql
-- List all tables
\dt

-- List all databases
\l

-- Exit psql
\q

-- View user data
SELECT * FROM users;

-- View database size
SELECT pg_database.datname, pg_size_pretty(pg_database_size(pg_database.datname)) 
FROM pg_database;
```

### Backup Database

```bash
# Create backup
docker-compose exec -T postgres pg_dump -U postgres sederek_kasir > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
docker-compose exec -T postgres psql -U postgres sederek_kasir < backup_20240307_143020.sql
```

### Check Database Migrations

```bash
# View logs to check if migrations ran
docker-compose logs app | grep -i migrate
```

---

## Updating Code

### Pull Latest Changes

```bash
git pull origin main
```

### Rebuild and Restart

```bash
# Stop current containers
docker-compose down

# Rebuild images with new code
docker-compose up -d --build

# View logs to confirm
docker-compose logs -f app
```

---

## Troubleshooting

### App won't start / keeps restarting

```bash
# Check logs
docker-compose logs app

# Common issues:
# - Database not ready yet (check postgres healthcheck)
# - Port 3000 already in use
# - Environment variables missing
```

### Database won't connect

```bash
# Check postgres logs
docker-compose logs postgres

# Check if postgres is healthy
docker-compose ps

# Try restarting
docker-compose restart postgres
```

### Port 3000 already in use

```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or change port in docker-compose.yml and .env
```

### Migrations not running

```bash
# Check logs
docker-compose logs app

# If migrations failed, restart app
docker-compose restart app
```

### Out of Memory (OOM) Errors

```bash
# Check container memory usage
docker stats

# Current config: 1.5GB per container
# If you need more, update docker-compose.yml:
# deploy.resources.limits.memory: 2G
```

### Can't connect to database from outside Docker

```bash
# Database is only accessible locally by default
# To allow external connections:

# 1. Check VPS firewall allows port 5432
sudo ufw allow 5432/tcp

# 2. Update .env if accessing from other machine:
DB_HOST=your-vps-domain-or-ip
DB_PORT=5432

# 3. Connect from external machine:
psql -h your-vps-ip -U postgres -d sederek_kasir
```

---

## Production Checklist

Before going live:

- [ ] Changed DB_PASSWORD to strong password (32+ chars)
- [ ] Changed JWT_SECRET to strong random string
- [ ] Changed JWT_REFRESH_SECRET to strong random string
- [ ] Set CORS_ORIGIN to actual frontend domain
- [ ] Set NODE_ENV=production in .env
- [ ] Tested API endpoints work correctly
- [ ] Tested database backups work
- [ ] Setup SSL/HTTPS with Nginx reverse proxy
- [ ] Configured firewall rules (ports 80, 443 open)
- [ ] Setup automatic backups (optional)
- [ ] Monitored logs for errors

---

## Additional Resources

### Docker Commands Reference

```bash
# View all images
docker images

# View all containers (running and stopped)
docker ps -a

# Remove dangling images
docker image prune

# Remove unused containers
docker container prune

# View resource usage
docker stats
```

### Useful Files

- `Dockerfile` - Image build configuration
- `docker-compose.yml` - Services orchestration (app + postgres)
- `.env` - Environment variables (KEEP SECRET!)
- `.env.production` - Template for production .env
- `.dockerignore` - Files excluded from Docker build

### If You Need Help

1. Check logs: `docker-compose logs -f app`
2. Check status: `docker-compose ps`
3. Verify .env file has all required values
4. Ensure ports 3000 and 5432 are not blocked

---

## System Requirements Met

✅ **RAM:** 4GB allocated (App: 1.5GB, DB: 1.5GB, OS: 1GB buffer)  
✅ **CPU:** 2 cores allocated (App: 1.0, DB: 1.0)  
✅ **Storage:** PostgreSQL volume for data persistence  
✅ **Auto-restart:** Both app and database auto-restart on failure  
✅ **Health checks:** Built-in health checks for both services  

---

**Last Updated:** March 2024  
**Docker Version:** 3.9 (Compose file format)  
**Node.js:** 18-alpine  
**PostgreSQL:** 14-alpine
