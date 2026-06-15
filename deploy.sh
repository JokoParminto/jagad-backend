#!/bin/bash
# =============================================================================
# POS JAGAD — Backend Deploy Script
# Usage: bash deploy.sh
# =============================================================================
set -e

APP_NAME="pos-jagad-api"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
info() { echo -e "${YELLOW}[..] $1${NC}"; }
fail() { echo -e "${RED}[!!] $1${NC}"; exit 1; }

echo ""
echo "============================================="
echo "  POS JAGAD Backend Deploy"
echo "  Dir: $APP_DIR"
echo "============================================="

cd "$APP_DIR"

# ── 0. Git pull ───────────────────────────────────────────────────────────────
info "[0/6] Git pull latest code..."
git pull
ok "Code updated"

# ── 1. Cek .env ──────────────────────────────────────────────────────────────
info "Checking .env..."
if [ ! -f ".env" ]; then
  fail ".env tidak ditemukan! Copy .env.production ke .env dan isi DB_HOST, DB_PASSWORD, JWT_SECRET"
fi
ok ".env found"

# Pastikan NODE_ENV=production
if ! grep -q "NODE_ENV=production" .env; then
  echo "NODE_ENV=production" >> .env
  ok "Added NODE_ENV=production to .env"
fi

# ── 2. Check Node & PM2 ──────────────────────────────────────────────────────
info "Checking Node.js..."
NODE_VER=$(node -v 2>/dev/null) || fail "Node.js tidak terinstall. Install dulu: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
ok "Node $NODE_VER"

if ! command -v pm2 &>/dev/null; then
  info "PM2 tidak ditemukan, install..."
  npm install -g pm2
  ok "PM2 installed"
else
  ok "PM2 $(pm2 -v)"
fi

# ── 3. npm install ───────────────────────────────────────────────────────────
echo ""
info "[1/6] npm install..."
npm install
ok "Dependencies installed"

# ── 4. Build TypeScript ──────────────────────────────────────────────────────
echo ""
info "[2/6] Building TypeScript..."
npm run build
ok "Build complete → dist/"

# ── 5. Buat uploads dir ──────────────────────────────────────────────────────
mkdir -p uploads
ok "uploads/ directory ready"

# ── 6. Run migrations ────────────────────────────────────────────────────────
echo ""
info "[3/6] Running database migrations..."
npm run migrate
ok "Migrations done"

# ── 7. Seed base data ────────────────────────────────────────────────────────
echo ""
info "[4/6] Seeding base data..."
SEED_FILE="$APP_DIR/src/database/seed_base.sql"
if [ -f "$SEED_FILE" ]; then
  # Load DB vars from .env
  DB_HOST=$(grep '^DB_HOST=' .env | cut -d= -f2)
  DB_PORT=$(grep '^DB_PORT=' .env | cut -d= -f2 || echo '5432')
  DB_NAME=$(grep '^DB_NAME=' .env | cut -d= -f2)
  DB_USER=$(grep '^DB_USER=' .env | cut -d= -f2)
  DB_PASS=$(grep '^DB_PASSWORD=' .env | cut -d= -f2)

  PGPASSWORD="$DB_PASS" psql \
    -h "$DB_HOST" -p "$DB_PORT" \
    -U "$DB_USER" -d "$DB_NAME" \
    -f "$SEED_FILE" -v ON_ERROR_STOP=0 \
    2>&1 | grep -v "^SET\|^BEGIN\|^COMMIT" || true
  ok "Base data seeded (ON CONFLICT DO NOTHING — aman re-run)"
else
  info "seed_base.sql tidak ditemukan, skip seed"
fi

# ── 8. PM2 start / restart via ecosystem ────────────────────────────────────
echo ""
info "[5/6] Starting server via PM2 ecosystem..."
mkdir -p logs
if pm2 list | grep -q "$APP_NAME"; then
  pm2 reload ecosystem.config.js --env production
  ok "PM2 reloaded (zero-downtime): $APP_NAME"
else
  pm2 start ecosystem.config.js --env production
  ok "PM2 started: $APP_NAME"
fi

info "[6/6] Done"

pm2 save --force

# ── 6. Summary ───────────────────────────────────────────────────────────────
echo ""
echo "============================================="
echo -e "  ${GREEN}Deploy selesai!${NC}"
echo "============================================="
echo ""
echo "CORS   : open (all origins)"
echo "Port   : $(grep '^PORT=' .env | cut -d= -f2 || echo '3000')"
echo "DB     : $(grep '^DB_NAME=' .env | cut -d= -f2)@$(grep '^DB_HOST=' .env | cut -d= -f2)"
echo ""
pm2 status "$APP_NAME"
echo ""
echo "Log    : pm2 logs $APP_NAME"
echo "Stop   : pm2 stop $APP_NAME"
echo "Reload : bash deploy.sh"
