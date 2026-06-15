#!/bin/bash
# =============================================================================
# POS JAGAD — One-time Nginx Setup for VPS
# Run ONCE saat pertama deploy ke VPS baru
# Usage: sudo bash setup-nginx.sh
# =============================================================================
set -e

DOMAIN="api.jagad-coffee.my.id"
NGINX_CONF="/etc/nginx/sites-available/pos-jagad"
NGINX_ENABLED="/etc/nginx/sites-enabled/pos-jagad"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
info() { echo -e "${YELLOW}[..] $1${NC}"; }
fail() { echo -e "${RED}[!!] $1${NC}"; exit 1; }

# Must run as root
[ "$(id -u)" = "0" ] || fail "Run as root: sudo bash setup-nginx.sh"

echo ""
echo "============================================="
echo "  POS JAGAD Nginx Setup"
echo "  Domain: $DOMAIN"
echo "============================================="
echo ""

# ── 1. Install nginx ─────────────────────────────────────────────────────────
if ! command -v nginx &>/dev/null; then
    info "Install nginx..."
    apt-get update -qq && apt-get install -y nginx
    ok "Nginx installed"
else
    ok "Nginx $(nginx -v 2>&1 | grep -o '[0-9.]*' | head -1)"
fi

# ── 2. Copy config ───────────────────────────────────────────────────────────
info "Copy nginx config → $NGINX_CONF"
cp "$SCRIPT_DIR/nginx.conf" "$NGINX_CONF"
ok "Config copied"

# ── 3. Disable default site ──────────────────────────────────────────────────
if [ -f /etc/nginx/sites-enabled/default ]; then
    rm /etc/nginx/sites-enabled/default
    ok "Default site disabled"
fi

# ── 4. Enable pos-jagad site ─────────────────────────────────────────────────
if [ ! -L "$NGINX_ENABLED" ]; then
    ln -s "$NGINX_CONF" "$NGINX_ENABLED"
    ok "Site enabled: pos-jagad"
else
    ok "Site already enabled"
fi

# ── 5. Test & reload nginx ────────────────────────────────────────────────────
info "Test nginx config..."
nginx -t || fail "Nginx config error! Fix config then re-run."
ok "Nginx config valid"

systemctl enable nginx
systemctl restart nginx
ok "Nginx started"

# ── 6. UFW firewall ──────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    ufw allow 80/tcp  > /dev/null 2>&1 || true
    ufw allow 443/tcp > /dev/null 2>&1 || true
    ok "UFW: ports 80 & 443 open"
fi

echo ""
echo "============================================="
echo -e "  ${GREEN}Nginx setup selesai!${NC}"
echo "============================================="
echo ""
echo "Test: curl -I http://$DOMAIN/health"
echo "      curl -I http://$DOMAIN/api"
echo ""
echo "Jika ada error, cek: sudo nginx -t"
echo "                     sudo journalctl -u nginx -n 50"
echo ""
