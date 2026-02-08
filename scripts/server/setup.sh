#!/bin/bash
# ArioPi — Sunucu kurulum scripti (Ubuntu/Debian tabanlı)
# Eski servisi ve build çıktılarını temizler, ardından yeni sürümü kurar.
# Kullanım: sudo bash scripts/server/setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "=============================================="
echo "  ArioPi — Sunucu Kurulumu"
echo "=============================================="
echo "Proje dizini: $PROJECT_ROOT"
echo ""

# --- Eski sürüm ve servis temizliği ---
echo "[0/8] Eski sürüm ve servisler temizleniyor..."
if systemctl is-active --quiet ariopi-server 2>/dev/null; then
  systemctl stop ariopi-server
  echo "  ariopi-server servisi durduruldu."
fi
if systemctl is-enabled --quiet ariopi-server 2>/dev/null; then
  systemctl disable ariopi-server
  echo "  ariopi-server açılıştan kaldırıldı."
fi
rm -f /etc/systemd/system/ariopi-server.service
if [ -f /etc/systemd/system/ariopi-server.service ]; then
  echo "  Uyarı: servis dosyası silinemedi (manuel kontrol edin)."
fi
systemctl daemon-reload 2>/dev/null || true
rm -rf "$PROJECT_ROOT/server/node_modules" "$PROJECT_ROOT/admin/node_modules" "$PROJECT_ROOT/player/node_modules"
rm -rf "$PROJECT_ROOT/server/public/admin" "$PROJECT_ROOT/server/public/player"
echo "  Eski node_modules ve public build çıktıları temizlendi."
echo ""

# --- İnteraktif bilgiler ---
read -p "Sunucu IP adresi (bu makinenin IP'si, örn. 192.168.1.10): " SERVER_IP
SERVER_IP="${SERVER_IP:-0.0.0.0}"

read -p "Port (varsayılan 3000): " PORT
PORT="${PORT:-3000}"

read -p "Bind adresi (varsayılan 0.0.0.0 - tüm ağ): " BIND
BIND="${BIND:-0.0.0.0}"

# Socket URL (admin/player buradan bağlanacak)
if [ "$SERVER_IP" = "0.0.0.0" ]; then
  SOCKET_URL="http://localhost:${PORT}"
  echo "Not: SERVER_IP 0.0.0.0 girildi; build için localhost kullanılıyor. Production'da sunucunun gerçek IP'sini girin."
else
  SOCKET_URL="http://${SERVER_IP}:${PORT}"
fi

echo ""
echo "Kurulum özeti:"
echo "  Port: $PORT"
echo "  Bind: $BIND"
echo "  Socket URL (admin/player): $SOCKET_URL"
echo ""
read -p "Devam edilsin mi? (e/h) [e]: " CONFIRM
CONFIRM="${CONFIRM:-e}"
if [ "$CONFIRM" != "e" ] && [ "$CONFIRM" != "E" ]; then
  echo "İptal edildi."
  exit 0
fi

# --- Node.js kontrolü ---
echo ""
echo "[1/8] Node.js kontrol ediliyor..."
if ! command -v node &>/dev/null; then
  echo "Node.js bulunamadı. Kuruluyor (NodeSource 20.x)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "  Node: $(node -v)"
echo "  npm:  $(npm -v)"

# --- Sunucu bağımlılıkları ---
echo ""
echo "[2/8] Server bağımlılıkları yükleniyor..."
cd "$PROJECT_ROOT/server"
npm install --production=false

# --- Admin build ---
echo ""
echo "[3/8] Admin paneli build ediliyor (VITE_SOCKET_URL=$SOCKET_URL, base=/admin/)..."
cd "$PROJECT_ROOT/admin"
npm install
export VITE_SOCKET_URL="$SOCKET_URL"
export VITE_BASE_PATH="/admin/"
npm run build

# --- Player build ---
echo ""
echo "[4/8] Player build ediliyor (VITE_SOCKET_URL=$SOCKET_URL, base=/player/)..."
cd "$PROJECT_ROOT/player"
npm install
export VITE_SOCKET_URL="$SOCKET_URL"
export VITE_BASE_PATH="/player/"
npm run build

# --- Static dosyaları server/public altına kopyala ---
echo ""
echo "[5/8] Build çıktıları server/public altına kopyalanıyor..."
mkdir -p "$PROJECT_ROOT/server/public"
rm -rf "$PROJECT_ROOT/server/public/admin" "$PROJECT_ROOT/server/public/player"
cp -r "$PROJECT_ROOT/admin/dist" "$PROJECT_ROOT/server/public/admin"
cp -r "$PROJECT_ROOT/player/dist" "$PROJECT_ROOT/server/public/player"
echo "  /admin -> server/public/admin"
echo "  /player -> server/public/player"

# --- .env oluştur ---
echo ""
echo "[6/8] server/.env oluşturuluyor..."
cat > "$PROJECT_ROOT/server/.env" << EOF
# ArioPi Server — Bu dosya setup.sh tarafından oluşturuldu
PORT=$PORT
BIND=$BIND
EOF
echo "  PORT=$PORT"
echo "  BIND=$BIND"

# --- systemd servisi (production: her zaman kurulu) ---
echo ""
echo "[7/8] systemd servisi kuruluyor (ariopi-server)..."
SERVICE_FILE="/etc/systemd/system/ariopi-server.service"
NODE_PATH=$(which node)
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=ArioPi Digital Signage Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SUDO_USER
WorkingDirectory=$PROJECT_ROOT/server
ExecStart=$NODE_PATH index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=$PROJECT_ROOT/server/.env

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable ariopi-server
systemctl start ariopi-server 2>/dev/null || true
echo "  Servis kuruldu ve açılışta başlamak üzere etkinleştirildi."

echo ""
echo "=============================================="
echo "  Kurulum tamamlandı."
echo "=============================================="
echo "systemd: sudo systemctl status ariopi-server | start | stop | restart"
echo ""
echo "Erişim adresleri:"
echo "  Admin:  http://localhost:${PORT}/admin/"
echo "  Player: http://localhost:${PORT}/player/"
if [ -n "$SERVER_IP" ] && [ "$SERVER_IP" != "0.0.0.0" ]; then
  echo "  Ağ: Admin  http://${SERVER_IP}:${PORT}/admin/"
  echo "  Ağ: Player http://${SERVER_IP}:${PORT}/player/"
fi
echo ""
