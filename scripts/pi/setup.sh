#!/bin/bash
# ArioPi — Raspberry Pi (kiosk) kurulum scripti
# Eski kiosk servisini temizler, ardından yeni sürümü kurar.
# Kullanım: sudo bash scripts/pi/setup.sh

set -e

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

# --- Eski servis temizliği ---
echo "[0/8] Eski kiosk servisi temizleniyor..."
if systemctl is-active --quiet ariopi-kiosk 2>/dev/null; then
  systemctl stop ariopi-kiosk
  echo "  ariopi-kiosk servisi durduruldu."
fi
if systemctl is-enabled --quiet ariopi-kiosk 2>/dev/null; then
  systemctl disable ariopi-kiosk
  echo "  ariopi-kiosk açılıştan kaldırıldı."
fi
rm -f /etc/systemd/system/ariopi-kiosk.service
if [ -f /etc/systemd/system/ariopi-kiosk.service ]; then
  echo "  Uyarı: servis dosyası silinemedi (manuel kontrol edin)."
fi
systemctl daemon-reload 2>/dev/null || true
echo "  Eski servis temizliği tamamlandı."
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
echo "[1/8] Paket listesi güncelleniyor..."
apt-get update -qq

# --- GUI ve Chromium ---
echo ""
echo "[2/8] Xorg, Openbox ve Chromium kuruluyor..."
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
echo "[3/8] Openbox autostart (kiosk) yazılıyor..."
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
echo "[4/8] .xinitrc (openbox-session)..."
echo 'exec openbox-session' > /home/"$KIOSK_USER"/.xinitrc
chown "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.xinitrc

# --- systemd kiosk servisi (vt1 = HDMI'da doğrudan kiosk görünsün) ---
echo ""
echo "[5/8] systemd kiosk servisi kuruluyor (ariopi-kiosk)..."
XORG_BIN=""
for x in /usr/lib/xorg/Xorg /usr/lib/xserver-Xorg/Xorg /usr/bin/Xorg X; do
  if command -v "$x" &>/dev/null || [ -x "$x" ]; then
    XORG_BIN="$x"
    break
  fi
done
[ -z "$XORG_BIN" ] && XORG_BIN="X"

# tty1'de getty çalışmasın; kiosk tty1'i kullansın (HDMI'da kiosk görünsün)
systemctl mask getty@tty1.service 2>/dev/null || true

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
ExecStart=/usr/bin/xinit /home/$KIOSK_USER/.xinitrc -- $XORG_BIN :0 vt1
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable ariopi-kiosk
echo "  Servis kuruldu; kiosk vt1'de (HDMI'da) açılacak."

# --- Konsol erişimi tty2'de (Ctrl+Alt+F2) ---
echo ""
echo "[6/8] Konsol tty2'de erişilebilir (Ctrl+Alt+F2)."

# --- Player URL'yi kiosk kullanıcı ortamında sakla (isteğe bağlı) ---
echo ""
echo "[7/8] Kurulum özeti yazılıyor..."
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
echo "Kiosk açılışta HDMI'da (vt1) otomatik başlar. Konsol: Ctrl+Alt+F2 (tty2)."
echo ""
echo "Sunucunun bu Pi'ye erişilebilir olduğundan emin olun (firewall, aynı ağ)."
echo "Yeniden başlatın: sudo reboot"
echo ""
