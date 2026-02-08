#!/bin/bash
# ArioPi — Raspberry Pi (kiosk) kurulum scripti
# Raspberry Pi OS Lite üzerinde çalıştırın: sudo bash scripts/pi/setup.sh
# Proje kök dizininden veya scripts/pi içinden çalıştırılabilir.

set -e

# Proje kök dizinini bul (script ariopi içinde değilse çalışma dizinini kullan)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/../.." ] && [ -f "$SCRIPT_DIR/../../server/index.js" ]; then
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
else
  PROJECT_ROOT="$(pwd)"
fi

KIOSK_USER="${SUDO_USER:-pi}"

echo "=============================================="
echo "  ArioPi — Raspberry Pi Kiosk Kurulumu"
echo "=============================================="
echo "Kiosk kullanıcısı: $KIOSK_USER"
echo ""

# --- İnteraktif bilgiler ---
echo "Player sayfası, sunucudaki /player adresinde açılacak."
echo "Örnek: Sunucu IP 192.168.1.10 ve port 3000 ise Player URL: http://192.168.1.10:3000/player/"
echo ""
read -p "Sunucu IP adresi (ArioPi sunucusunun IP'si): " SERVER_IP
read -p "Sunucu port (varsayılan 3000): " SERVER_PORT
SERVER_PORT="${SERVER_PORT:-3000}"

PLAYER_URL="http://${SERVER_IP}:${SERVER_PORT}/player/"
echo ""
echo "Player URL: $PLAYER_URL"
echo ""
read -p "Doğru mu? Devam edilsin mi? (e/h) [e]: " CONFIRM
CONFIRM="${CONFIRM:-e}"
if [ "$CONFIRM" != "e" ] && [ "$CONFIRM" != "E" ]; then
  echo "İptal edildi."
  exit 0
fi

# --- Sistem güncellemesi ---
echo ""
echo "[1/6] Paket listesi güncelleniyor..."
apt-get update -qq

# --- GUI ve Chromium ---
echo ""
echo "[2/6] Xorg, Openbox ve Chromium kuruluyor..."
apt-get install -y --no-install-recommends \
  xorg \
  openbox \
  unclutter \
  xdotool

# Raspberry Pi OS / Debian'da chromium-browser veya chromium
if apt-get install -y --no-install-recommends chromium-browser 2>/dev/null; then
  CHROMIUM_CMD="chromium-browser"
elif apt-get install -y --no-install-recommends chromium 2>/dev/null; then
  CHROMIUM_CMD="chromium"
else
  echo "Hata: chromium-browser veya chromium kurulamadı."
  exit 1
fi
echo "  Chromium komutu: $CHROMIUM_CMD"

# --- Openbox autostart ---
echo ""
echo "[3/6] Openbox autostart (kiosk) yazılıyor..."
mkdir -p /home/"$KIOSK_USER"/.config/openbox
cat > /home/"$KIOSK_USER"/.config/openbox/autostart << EOF
# İmleci gizle (0.5 saniye hareketsizlikten sonra)
unclutter -idle 0.5 -root &

# Chromium kiosk modunda Player URL'sini aç
$CHROMIUM_CMD \\
  --kiosk \\
  --noerrdialogs \\
  --disable-infobars \\
  --no-first-run \\
  --disable-session-crashed-bubble \\
  --check-for-update-interval=31536000 \\
  "$PLAYER_URL"
EOF
chown -R "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.config/openbox

# --- Otomatik giriş (getty) ---
echo ""
echo "[4/6] Tty1 otomatik giriş ayarlanıyor..."
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $KIOSK_USER --noclear %I \$TERM
EOF

# --- .profile ile startx ---
echo ""
echo "[5/6] Konsol girişinde X başlatma (.profile)..."
if ! grep -q 'startx' /home/"$KIOSK_USER"/.profile 2>/dev/null; then
  echo '' >> /home/"$KIOSK_USER"/.profile
  echo '# ArioPi kiosk: tty1 girişinde X başlat' >> /home/"$KIOSK_USER"/.profile
  echo 'if [ -z "$DISPLAY" ] && [ "$(tty)" = /dev/tty1 ]; then startx; fi' >> /home/"$KIOSK_USER"/.profile
  chown "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.profile
fi

# --- .xinitrc (openbox) ---
echo ""
echo "[6/6] .xinitrc (openbox-session)..."
echo 'exec openbox-session' > /home/"$KIOSK_USER"/.xinitrc
chown "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.xinitrc

echo ""
echo "=============================================="
echo "  Pi kurulumu tamamlandı."
echo "=============================================="
echo "Player URL: $PLAYER_URL"
echo ""
echo "Sunucunun bu Pi'ye erişilebilir olduğundan emin olun (firewall, aynı ağ)."
echo "Yeniden başlattıktan sonra tty1'de otomatik giriş yapılıp kiosk açılacak:"
echo "  sudo reboot"
echo ""
echo "Manuel test için (X içinde):"
echo "  $CHROMIUM_CMD --kiosk $PLAYER_URL"
echo ""
