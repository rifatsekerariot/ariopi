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
echo "[1/7] Paket listesi güncelleniyor..."
apt-get update -qq

# --- GUI ve Chromium ---
echo ""
echo "[2/7] Xorg, Openbox ve Chromium kuruluyor..."
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
echo "[3/7] Openbox autostart (kiosk) yazılıyor..."
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

# --- .xinitrc (openbox) ---
echo ""
echo "[4/7] .xinitrc (openbox-session)..."
echo 'exec openbox-session' > /home/"$KIOSK_USER"/.xinitrc
chown "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.xinitrc

# --- systemd kiosk servisi (production: açılışta kiosk) ---
echo ""
echo "[5/7] systemd kiosk servisi kuruluyor (ariopi-kiosk)..."
# Xorg yolu (Debian/Raspberry Pi OS)
XORG_BIN=""
for x in /usr/lib/xorg/Xorg /usr/lib/xserver-Xorg/Xorg /usr/bin/Xorg X; do
  if command -v "$x" &>/dev/null || [ -x "$x" ]; then
    XORG_BIN="$x"
    break
  fi
done
[ -z "$XORG_BIN" ] && XORG_BIN="X"

KIOSK_SERVICE="/etc/systemd/system/ariopi-kiosk.service"
cat > "$KIOSK_SERVICE" << EOF
[Unit]
Description=ArioPi Kiosk (Chromium Player)
After=multi-user.target

[Service]
Type=simple
User=$KIOSK_USER
Environment=HOME=/home/$KIOSK_USER
Environment=DISPLAY=:0
ExecStart=/usr/bin/xinit /home/$KIOSK_USER/.xinitrc -- $XORG_BIN :0 vt7
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable ariopi-kiosk
echo "  Servis kuruldu ve açılışta başlamak üzere etkinleştirildi."

# --- Tty1 otomatik giriş (isteğe bağlı konsol erişimi) ---
echo ""
echo "[6/7] Tty1 otomatik giriş (konsol erişimi için)..."
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $KIOSK_USER --noclear %I \$TERM
EOF

# --- Player URL'yi kiosk kullanıcı ortamında sakla (isteğe bağlı) ---
echo ""
echo "[7/7] Kurulum özeti yazılıyor..."
mkdir -p /home/"$KIOSK_USER"/.config/ariopi
echo "PLAYER_URL=$PLAYER_URL" > /home/"$KIOSK_USER"/.config/ariopi/player-url
chown -R "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.config/ariopi

echo ""
echo "=============================================="
echo "  Pi kurulumu tamamlandı."
echo "=============================================="
echo "Player URL: $PLAYER_URL"
echo ""
echo "systemd: sudo systemctl status ariopi-kiosk | start | stop | restart"
echo "Kiosk açılışta otomatik başlar. Konsol için tty1'de $KIOSK_USER olarak giriş yapılır."
echo ""
echo "Sunucunun bu Pi'ye erişilebilir olduğundan emin olun (firewall, aynı ağ)."
echo "Yeniden başlatın: sudo reboot"
echo ""
