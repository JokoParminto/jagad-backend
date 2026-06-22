#!/bin/bash
# =============================================================================
# POS JAGAD — SSL Certificate Setup (Cloudflare Origin Certificate)
# Jalankan sekali atau setiap kali cert diperbarui:
#   bash certificates/setup-ssl.sh
# =============================================================================
set -e

CERT_DIR="$(cd "$(dirname "$0")" && pwd)"
NGINX_CONF="$(dirname "$CERT_DIR")/nginx.conf"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
info() { echo -e "${YELLOW}[..] $1${NC}"; }
fail() { echo -e "${RED}[!!] $1${NC}"; exit 1; }

echo ""
echo "============================================="
echo "  POS JAGAD SSL Setup"
echo "  Cert dir : $CERT_DIR"
echo "============================================="

# ── 0. Git pull ───────────────────────────────────────────────────────────────
info "[1/5] Git pull latest code..."
cd "$(dirname "$CERT_DIR")"
git pull
ok "Code updated"

# ── 1. Cek file cert ada ──────────────────────────────────────────────────────
info "[2/5] Checking certificate files..."

if [ ! -f "$CERT_DIR/jagad-origin.pem" ]; then
  fail "jagad-origin.pem tidak ditemukan di $CERT_DIR/
  Cara mendapatkan:
    1. Cloudflare Dashboard → SSL/TLS → Origin Server → Create Certificate
    2. Copy 'Origin Certificate' → simpan ke $CERT_DIR/jagad-origin.pem
    3. Copy 'Private Key'        → simpan ke $CERT_DIR/jagad-origin.key
    4. Jalankan script ini lagi"
fi

if [ ! -f "$CERT_DIR/jagad-origin.key" ]; then
  fail "jagad-origin.key tidak ditemukan di $CERT_DIR/"
fi

ok "Certificate files found"

# ── 2. Copy cert ke system ssl dir ───────────────────────────────────────────
info "[3/5] Installing certificates..."

sudo cp "$CERT_DIR/jagad-origin.pem" /etc/ssl/certs/jagad-origin.pem
sudo cp "$CERT_DIR/jagad-origin.key" /etc/ssl/private/jagad-origin.key
sudo chmod 644 /etc/ssl/certs/jagad-origin.pem
sudo chmod 600 /etc/ssl/private/jagad-origin.key

ok "Certificates installed"

# ── 3. Update nginx config ────────────────────────────────────────────────────
info "[4/5] Updating nginx config..."

sudo cp "$NGINX_CONF" /etc/nginx/sites-available/api-jagad

# Aktifkan jika belum ada symlink
if [ ! -L /etc/nginx/sites-enabled/api-jagad ]; then
  sudo ln -sf /etc/nginx/sites-available/api-jagad /etc/nginx/sites-enabled/api-jagad
  ok "Nginx site enabled"
fi

# Test config
sudo nginx -t || fail "Nginx config error — cek log di atas"
ok "Nginx config valid"

# ── 4. Reload nginx ───────────────────────────────────────────────────────────
info "[5/5] Reloading nginx..."
sudo systemctl reload nginx
ok "Nginx reloaded"

echo ""
echo "============================================="
echo -e "  ${GREEN}SSL setup selesai!${NC}"
echo "  HTTPS aktif: https://api.jagad-coffee.my.id"
echo "============================================="
echo ""
