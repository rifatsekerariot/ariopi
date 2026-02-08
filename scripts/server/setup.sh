#!/bin/bash
# ArioPi — Sunucu kurulum scripti (Ubuntu/Debian tabanlı)
# Kullanım: sudo bash scripts/server/setup.sh
# Proje kök dizininden veya scripts/server içinden çalıştırılabilir.

set -e

# Proje kök dizinini bul
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "=============================================="
echo "  ArioPi — Sunucu Kurulumu"
echo "=============================================="
echo "Proje dizini: $PROJECT_ROOT"
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
echo "[1/6] Node.js kontrol ediliyor..."
if ! command -v node &>/dev/null; then
  echo "Node.js bulunamadı. Kuruluyor (NodeSource 20.x)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "  Node: $(node -v)"
echo "  npm:  $(npm -v)"

# --- Sunucu bağımlılıkları ---
echo ""
echo "[2/6] Server bağımlılıkları yükleniyor..."
cd "$PROJECT_ROOT/server"
npm install --production=false

# --- Admin build ---
echo ""
echo "[3/6] Admin paneli build ediliyor (VITE_SOCKET_URL=$SOCKET_URL, base=/admin/)..."
cd "$PROJECT_ROOT/admin"
npm install
export VITE_SOCKET_URL="$SOCKET_URL"
export VITE_BASE_PATH="/admin/"
npm run build

# --- Player build ---
echo ""
echo "[4/6] Player build ediliyor (VITE_SOCKET_URL=$SOCKET_URL, base=/player/)..."
cd "$PROJECT_ROOT/player"
npm install
export VITE_SOCKET_URL="$SOCKET_URL"
export VITE_BASE_PATH="/player/"
npm run build

# --- Static dosyaları server/public altına kopyala ---
echo ""
echo "[5/6] Build çıktıları server/public altına kopyalanıyor..."
mkdir -p "$PROJECT_ROOT/server/public"
rm -rf "$PROJECT_ROOT/server/public/admin" "$PROJECT_ROOT/server/public/player"
cp -r "$PROJECT_ROOT/admin/dist" "$PROJECT_ROOT/server/public/admin"
cp -r "$PROJECT_ROOT/player/dist" "$PROJECT_ROOT/server/public/player"
echo "  /admin -> server/public/admin"
echo "  /player -> server/public/player"

# --- .env oluştur ---
echo ""
echo "[6/6] server/.env oluşturuluyor..."
cat > "$PROJECT_ROOT/server/.env" << EOF
# ArioPi Server — Bu dosya setup.sh tarafından oluşturuldu
PORT=$PORT
BIND=$BIND
EOF
echo "  PORT=$PORT"
echo "  BIND=$BIND"

# --- systemd servisi (isteğe bağlı) ---
read -p "systemd servisi kurulsun mu? (sunucu açılışta otomatik başlar) (e/h) [h]: " INSTALL_SERVICE
INSTALL_SERVICE="${INSTALL_SERVICE:-h}"
if [ "$INSTALL_SERVICE" = "e" ] || [ "$INSTALL_SERVICE" = "E" ]; then
  SERVICE_FILE="/etc/systemd/system/ariopi-server.service"
  cat > "$SERVICE_FILE" << EOF
[Unit]
Description=ArioPi Digital Signage Server
After=network.target

[Service]
Type=simple
User=$SUDO_USER
WorkingDirectory=$PROJECT_ROOT/server
ExecStart=$(which node) index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=$PROJECT_ROOT/server/.env

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable ariopi-server
  echo "  systemd servisi eklendi: ariopi-server"
  echo "  Başlatmak için: sudo systemctl start ariopi-server"
fi

echo ""
echo "=============================================="
echo "  Kurulum tamamlandı."
echo "=============================================="
echo "Sunucuyu başlatmak için:"
echo "  cd $PROJECT_ROOT/server && npm start"
echo ""
echo "Erişim adresleri (bu makine üzerinden):"
echo "  Admin:  http://localhost:${PORT}/admin/"
echo "  Player: http://localhost:${PORT}/player/"
if [ -n "$SERVER_IP" ] && [ "$SERVER_IP" != "0.0.0.0" ]; then
  echo "Ağ üzerinden:"
  echo "  Admin:  http://${SERVER_IP}:${PORT}/admin/"
  echo "  Player: http://${SERVER_IP}:${PORT}/player/"
fi
echo ""
