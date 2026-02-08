#!/bin/bash
# ArioPi — Raspberry Pi kurulumu (tek script)
# Pi açılınca oynatıcı ekranı gelir, sunucuya kayıt olur; sunucudan video gönderip oynatırsınız.
# Kullanım: sudo bash scripts/pi/setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LITE_DIR="$SCRIPT_DIR/lite"
USER="${SUDO_USER:-pi}"
INSTALL_DIR="/opt/ariopi-signage"
CONFIG_DIR="/etc/ariopi-signage"

echo "=============================================="
echo "  ArioPi — Raspberry Pi Kurulumu"
echo "=============================================="
echo "Bu script: Oynatıcı ekranı kurar. Pi açılınca ekranda oynatıcı görünür, sunucuya bağlanır."
echo ""

read -p "Sunucu adresi (ornek: http://188.132.211.90:3000): " SERVER_URL
SERVER_URL="${SERVER_URL:-http://localhost:3000}"
read -p "Bu cihazin Player ID'si (ornek: pi_1): " PLAYER_ID
PLAYER_ID="${PLAYER_ID:-pi_1}"
echo ""
echo "Sunucu: $SERVER_URL  Player ID: $PLAYER_ID"
read -p "Devam? (e/h) [e]: " CONFIRM
CONFIRM="${CONFIRM:-e}"
if [ "$CONFIRM" != "e" ] && [ "$CONFIRM" != "E" ]; then
  echo "Iptal."
  exit 0
fi

# --- Eski kurulum temizliği ---
echo ""
echo "[0/8] Eski kurulum temizleniyor..."
for svc in ariopi-kiosk ariopi-signage; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then systemctl stop "$svc"; fi
  if systemctl is-enabled --quiet "$svc" 2>/dev/null; then systemctl disable "$svc"; fi
done
rm -f /etc/systemd/system/ariopi-kiosk.service
for f in .profile .bash_profile; do
  p="/home/$USER/$f"
  [ -f "$p" ] && grep -q 'ariopi-kiosk-startx\|ariopi-launch-player' "$p" 2>/dev/null && sed -i '/ariopi-kiosk-startx\|ariopi-launch-player/d' "$p"
done
systemctl daemon-reload 2>/dev/null || true
echo "  Tamamlandi."

# --- cloud-init devre disi (boot'ta "Reached target cloud-init.target" takilmasini onler) ---
echo ""
echo "[1/8] cloud-init devre disi birakiliyor..."
if [ -d /etc/cloud ]; then
  touch /etc/cloud/cloud-init.disabled 2>/dev/null && echo "  /etc/cloud/cloud-init.disabled olusturuldu." || true
fi
systemctl disable cloud-init 2>/dev/null || true
systemctl disable cloud-init-local 2>/dev/null || true
systemctl disable cloud-config 2>/dev/null || true
systemctl disable cloud-final 2>/dev/null || true
echo "  Tamamlandi."

# --- Paketler ---
echo ""
echo "[2/8] Paketler guncelleniyor..."
apt-get update -qq
echo ""
echo "[3/8] mpv ve python3 kuruluyor..."
apt-get install -y --no-install-recommends mpv python3

# --- Oynatıcı dosyaları ---
echo ""
echo "[4/8] Oynatıcı kopyalaniyor..."
mkdir -p "$INSTALL_DIR"
cp "$LITE_DIR/signage_client.py" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/signage_client.py"

# --- Config ---
echo ""
echo "[5/8] Config yaziliyor..."
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/config.json" << EOF
{
  "server_url": "$SERVER_URL",
  "player_id": "$PLAYER_ID",
  "mpv_vo": "auto"
}
EOF
chown -R "$USER":"$USER" "$CONFIG_DIR" 2>/dev/null || true
chmod 644 "$CONFIG_DIR/config.json"

# --- systemd servisi (açılışta oynatıcı) ---
echo ""
echo "[6/8] Servis kuruluyor (acilista oynatıcı baslar)..."
sed "s/User=pi/User=$USER/" "$LITE_DIR/ariopi-signage.service" | \
  sed "s|/home/pi|/home/$USER|g" > /etc/systemd/system/ariopi-signage.service
systemctl daemon-reload
systemctl enable ariopi-signage
systemctl start ariopi-signage 2>/dev/null || true

# --- Konsolu HDMI'dan kaldır (tty ekranı görünmesin) ---
echo ""
echo "[7/8] Konsol HDMI'dan kaldiriliyor (sadece oynatıcı ekrani gorunur)..."
systemctl disable getty@tty1.service 2>/dev/null || true
# Alternatif: konsolu tty2'ye tasi (SSH/klavye ile tty2'de giris yapilabilir)
if [ -f /boot/cmdline.txt ]; then
  if ! grep -q 'console=tty2' /boot/cmdline.txt 2>/dev/null; then
    sed -i 's/console=tty1/console=tty2/' /boot/cmdline.txt 2>/dev/null || true
  fi
fi
echo "  getty@tty1 kapatildi."

# --- GPU / HDMI ---
echo ""
echo "[8/8] GPU ve ozet..."
for BOOT_CONF in /boot/config.txt /boot/firmware/config.txt; do
  [ -f "$BOOT_CONF" ] || continue
  grep -q '^hdmi_force_hotplug=1' "$BOOT_CONF" 2>/dev/null || echo "hdmi_force_hotplug=1" >> "$BOOT_CONF"
  grep -q '^gpu_mem=' "$BOOT_CONF" 2>/dev/null || echo "gpu_mem=256" >> "$BOOT_CONF"
  break
done

echo ""
echo "=============================================="
echo "  Kurulum tamamlandi."
echo "=============================================="
echo "Pi acilinca: Oynatıcı ekrani (once siyah/bekliyor) gelir, sunucu online ise kayit olur."
echo "Sunucudan video gondermek: Admin panelinde video yukle, sonra asagidaki komutla bu cihaza oynat:"
echo "  curl -X POST $SERVER_URL/api/signage/play -H 'Content-Type: application/json' -d '{\"player_id\":\"$PLAYER_ID\",\"video_id\":\"VIDEO_ID\"}'"
echo ""
echo "Video ID'yi sunucu Admin sayfasindaki kutuphaneden alin. Durdurmak icin:"
echo "  curl -X POST $SERVER_URL/api/signage/stop -H 'Content-Type: application/json' -d '{\"player_id\":\"$PLAYER_ID\"}'"
echo ""
echo "Son adim: sudo reboot"
echo ""
