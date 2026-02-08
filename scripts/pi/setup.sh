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
echo "[0/9] Eski kiosk servisi temizleniyor..."
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
echo "[1/9] Paket listesi güncelleniyor..."
apt-get update -qq

# --- GUI ve Chromium ---
echo ""
echo "[2/9] Xorg, Openbox ve Chromium kuruluyor..."
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

# --- Openbox autostart (ekran blanking kapalı, Chromium öncesi bekleme) ---
echo ""
echo "[3/9] Openbox autostart (kiosk) yazılıyor..."
mkdir -p /home/"$KIOSK_USER"/.config/openbox
cat > /home/"$KIOSK_USER"/.config/openbox/autostart << EOF
# Ekran blanking / screensaver kapat (siyah ekran önleme)
xset s off
xset s noblank
xset -dpms

# İmleci gizle
unclutter -idle 0.5 -root &

# Ağ ve X hazır olsun diye kısa bekleme (Pi siyah ekran sorununu azaltır)
sleep 8

# Chromium kiosk modunda Player URL'sini aç
$CHROMIUM_CMD \\
  --kiosk \\
  --noerrdialogs \\
  --disable-infobars \\
  --no-first-run \\
  --disable-session-crashed-bubble \\
  --check-for-update-interval=31536000 \\
  --disable-backgrounding-occluded-windows \\
  "$PLAYER_URL"
EOF
chown -R "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.config/openbox

# --- .xinitrc (openbox) ---
echo ""
echo "[4/9] .xinitrc (openbox-session)..."
echo 'exec openbox-session' > /home/"$KIOSK_USER"/.xinitrc
chown "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.xinitrc

# --- getty@tty1 unmask (autologin + startx için gerekli) ---
echo ""
echo "[5/9] tty1 autologin ve startx ayarlanıyor..."
systemctl unmask getty@tty1.service 2>/dev/null || true
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $KIOSK_USER --noclear %I \$TERM
EOF

# --- .profile: tty1'de oturum açılınca startx (kiosk), ağ için kısa bekleme ---
if ! grep -q 'startx.*tty1' /home/"$KIOSK_USER"/.profile 2>/dev/null; then
  echo '' >> /home/"$KIOSK_USER"/.profile
  echo '# ArioPi kiosk: tty1 girişinde X ve Chromium kiosk başlat' >> /home/"$KIOSK_USER"/.profile
  echo 'if [ -z "$DISPLAY" ] && [ "$(tty)" = /dev/tty1 ]; then sleep 3; exec startx; fi' >> /home/"$KIOSK_USER"/.profile
  chown "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.profile
fi
echo "  Autologin ve startx ayarlandı; açılışta tty1'de kiosk başlar."

# --- HDMI siyah ekran önleme (/boot veya /boot/firmware) ---
echo ""
echo "[6/9] HDMI ayarı (siyah ekran önleme)..."
for BOOT_CONF in /boot/config.txt /boot/firmware/config.txt; do
  if [ -f "$BOOT_CONF" ]; then
    if ! grep -q '^hdmi_force_hotplug=1' "$BOOT_CONF" 2>/dev/null; then
      echo "hdmi_force_hotplug=1" >> "$BOOT_CONF"
      echo "  $BOOT_CONF: hdmi_force_hotplug=1 eklendi."
    else
      echo "  $BOOT_CONF: hdmi_force_hotplug=1 zaten var."
    fi
    break
  fi
done

# --- Konsol: tty2'de (Ctrl+Alt+F2) ---
echo ""
echo "[7/9] Konsol erişimi: Ctrl+Alt+F2 (tty2)."

# --- Player URL'yi kiosk kullanıcı ortamında sakla (isteğe bağlı) ---
echo ""
echo "[8/9] Kurulum özeti yazılıyor..."
mkdir -p /home/"$KIOSK_USER"/.config/ariopi
echo "PLAYER_URL=$PLAYER_URL" > /home/"$KIOSK_USER"/.config/ariopi/player-url
chown -R "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.config/ariopi

echo ""
echo "=============================================="
echo "  Pi kurulumu tamamlandı."
echo "=============================================="
echo "Player URL: $PLAYER_URL"
echo ""
echo "Açılışta tty1'de otomatik giriş yapılır ve startx ile kiosk başlar (HDMI)."
echo "Konsol: Ctrl+Alt+F2 (tty2)."
echo ""
echo "Sunucunun bu Pi'ye erişilebilir olduğundan emin olun (firewall, aynı ağ)."
echo "Yeniden başlatın: sudo reboot"
echo ""
