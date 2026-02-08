#!/bin/bash
# ArioPi — Raspberry Pi OS Lite kurulumu (GUI yok: MPV + Python)
# Xorg/Chromium yerine MPV ile doğrudan HDMI çıktı; sunucudan poll ile oynatılacak video alınır.
# Kullanım: sudo bash scripts/pi/setup-lite.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LITE_DIR="$SCRIPT_DIR/lite"
SIGNAGE_USER="${SUDO_USER:-pi}"
INSTALL_DIR="/opt/ariopi-signage"
CONFIG_DIR="/etc/ariopi-signage"

echo "=============================================="
echo "  ArioPi — Pi Lite (MPV) Kurulumu"
echo "=============================================="
echo "Kullanici: $SIGNAGE_USER"
echo ""

read -p "Sunucu URL (ornek: http://188.132.211.90:3000): " SERVER_URL
SERVER_URL="${SERVER_URL:-http://localhost:3000}"
read -p "Player ID (bu cihazin sunucudaki adi, ornek: lite_1): " PLAYER_ID
PLAYER_ID="${PLAYER_ID:-lite_1}"
echo ""
echo "Sunucu: $SERVER_URL  Player ID: $PLAYER_ID"
read -p "Devam? (e/h) [e]: " CONFIRM
CONFIRM="${CONFIRM:-e}"
if [ "$CONFIRM" != "e" ] && [ "$CONFIRM" != "E" ]; then
  echo "Iptal."
  exit 0
fi

# --- Eski kurulum temizliği (Chromium/startx tetikleyicisi kaldırılır, Lite kullanılacak) ---
echo ""
echo "[0/6] Eski kurulum temizleniyor..."
if systemctl is-active --quiet ariopi-signage 2>/dev/null; then
  systemctl stop ariopi-signage
fi
if systemctl is-enabled --quiet ariopi-signage 2>/dev/null; then
  systemctl disable ariopi-signage
fi
# Chromium kiosk ile startx tetikleyicisini kaldır (Lite'ta X yok)
for f in .profile .bash_profile; do
  p="/home/$SIGNAGE_USER/$f"
  [ -f "$p" ] || continue
  if grep -q 'ariopi-kiosk-startx\|ariopi-launch-player' "$p" 2>/dev/null; then
    sed -i '/ariopi-kiosk-startx\|ariopi-launch-player/d' "$p"
    echo "  $p: ArioPi kiosk satirlari kaldirildi."
  fi
done
systemctl daemon-reload 2>/dev/null || true
echo "  Eski kurulum temizligi tamamlandi."

echo ""
echo "[1/6] Paketler guncelleniyor..."
apt-get update -qq

echo ""
echo "[2/6] mpv ve python3 kuruluyor..."
apt-get install -y --no-install-recommends mpv python3 python3-urllib3

echo ""
echo "[3/6] ArioPi Lite dosyalari kopyalaniyor..."
mkdir -p "$INSTALL_DIR"
cp "$LITE_DIR/signage_client.py" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/signage_client.py"

echo ""
echo "[4/6] Config yaziliyor..."
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/config.json" << EOF
{
  "server_url": "$SERVER_URL",
  "player_id": "$PLAYER_ID",
  "mpv_vo": "auto"
}
EOF
chown -R "$SIGNAGE_USER":"$SIGNAGE_USER" "$CONFIG_DIR" 2>/dev/null || true
chmod 644 "$CONFIG_DIR/config.json"

echo ""
echo "[5/6] systemd servisi kuruluyor..."
sed "s/User=pi/User=$SIGNAGE_USER/" "$LITE_DIR/ariopi-signage.service" | \
  sed "s|/home/pi|/home/$SIGNAGE_USER|g" > /etc/systemd/system/ariopi-signage.service
systemctl daemon-reload
systemctl enable ariopi-signage
systemctl start ariopi-signage 2>/dev/null || true

echo ""
echo "[6/6] GPU bellek (video) ve ozet..."
for BOOT_CONF in /boot/config.txt /boot/firmware/config.txt; do
  [ -f "$BOOT_CONF" ] || continue
  if ! grep -q '^gpu_mem=' "$BOOT_CONF" 2>/dev/null; then
    echo "gpu_mem=256" >> "$BOOT_CONF"
    echo "  $BOOT_CONF: gpu_mem=256 eklendi."
  fi
  break
done

echo ""
echo "=============================================="
echo "  Pi Lite kurulumu tamamlandi."
echo "=============================================="
echo "Servis: ariopi-signage (acilista otomatik baslar)"
echo "  sudo systemctl status ariopi-signage"
echo "Config: $CONFIG_DIR/config.json"
echo ""
echo "Oynatma: Admin panelinden web player yerine Lite player icin"
echo "  curl -X POST $SERVER_URL/api/signage/play -H 'Content-Type: application/json' -d '{\"player_id\":\"$PLAYER_ID\",\"video_id\":\"VIDEO_ID\"}'"
echo "Durdur: curl -X POST $SERVER_URL/api/signage/stop -H 'Content-Type: application/json' -d '{\"player_id\":\"$PLAYER_ID\"}'"
echo ""
echo "Gerekirse: sudo reboot"
echo ""
