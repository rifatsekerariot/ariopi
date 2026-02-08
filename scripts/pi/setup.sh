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

# --- Eski kurulum temizliği (eski kiosk + Lite servisi kaldırılır, yeni Chromium kurulur) ---
echo "[0/9] Eski kurulum temizleniyor..."
if systemctl is-active --quiet ariopi-kiosk 2>/dev/null; then
  systemctl stop ariopi-kiosk
  echo "  ariopi-kiosk durduruldu."
fi
if systemctl is-enabled --quiet ariopi-kiosk 2>/dev/null; then
  systemctl disable ariopi-kiosk
fi
rm -f /etc/systemd/system/ariopi-kiosk.service
if systemctl is-active --quiet ariopi-signage 2>/dev/null; then
  systemctl stop ariopi-signage
  echo "  ariopi-signage (Lite) durduruldu."
fi
if systemctl is-enabled --quiet ariopi-signage 2>/dev/null; then
  systemctl disable ariopi-signage
  echo "  ariopi-signage acilisatan kaldirildi."
fi
systemctl daemon-reload 2>/dev/null || true
echo "  Eski kurulum temizligi tamamlandi."
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

# Ağ ve X hazır olsun diye kısa bekleme
sleep 8

# Önce sunucuya erişilebilir olana kadar bekle, sonra Player sayfasını aç (kayıt + oynatma orada olur)
/home/$KIOSK_USER/ariopi-launch-player.sh
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
systemctl daemon-reload
systemctl enable getty@tty1.service 2>/dev/null || true
echo "  getty@tty1 etkinlestirildi; acilista otomatik oturum acilir ve kiosk baslar."

# --- startx wrapper: loglama ile hata ayıklama (SSH ile /tmp/ariopi-startx.log bakılabilir) ---
WRAPPER="/home/$KIOSK_USER/ariopi-kiosk-startx.sh"
cat > "$WRAPPER" << 'WRAPEOF'
#!/bin/bash
LOG=/tmp/ariopi-startx.log
echo "=== $(date) tty=$(tty) DISPLAY=${DISPLAY:-yok} ===" >> "$LOG"
[ "$(tty)" != /dev/tty1 ] && exit 0
[ -n "${DISPLAY:-}" ] && exit 0
echo "ArioPi: startx baslatiliyor..." >> "$LOG"
sleep 3
exec startx >> "$LOG" 2>&1
WRAPEOF
chmod +x "$WRAPPER"
chown "$KIOSK_USER":"$KIOSK_USER" "$WRAPPER"
echo "  Startx wrapper: $WRAPPER (log: /tmp/ariopi-startx.log)"

# --- .profile: tty1'de wrapper çalıştır (bash login shell .profile okur) ---
if ! grep -q 'ariopi-kiosk-startx' /home/"$KIOSK_USER"/.profile 2>/dev/null; then
  echo '' >> /home/"$KIOSK_USER"/.profile
  echo '# ArioPi kiosk: tty1 girişinde X ve Chromium başlat' >> /home/"$KIOSK_USER"/.profile
  echo '[ -z "$DISPLAY" ] && [ "$(tty)" = /dev/tty1 ] && exec '"$WRAPPER" >> /home/"$KIOSK_USER"/.profile
  chown "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.profile
fi
# --- .bash_profile: bazı sistemlerde login'de sadece bu okunur; aynı tetikleyici ---
if [ ! -f /home/"$KIOSK_USER"/.bash_profile ] || ! grep -q 'ariopi-kiosk-startx' /home/"$KIOSK_USER"/.bash_profile 2>/dev/null; then
  touch /home/"$KIOSK_USER"/.bash_profile
  if ! grep -q 'ariopi-kiosk-startx' /home/"$KIOSK_USER"/.bash_profile 2>/dev/null; then
    echo '' >> /home/"$KIOSK_USER"/.bash_profile
    echo '# ArioPi kiosk: tty1 girişinde X başlat' >> /home/"$KIOSK_USER"/.bash_profile
    echo '[ -z "$DISPLAY" ] && [ "$(tty)" = /dev/tty1 ] && exec '"$WRAPPER" >> /home/"$KIOSK_USER"/.bash_profile
  fi
  chown "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.bash_profile
fi
echo "  Autologin + startx (.profile ve .bash_profile) ayarlandi."

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
    # Video oynatma siyah ekran/performans: GPU bellek 256MB (Chromium önerisi)
    if ! grep -q '^gpu_mem=' "$BOOT_CONF" 2>/dev/null; then
      echo "gpu_mem=256" >> "$BOOT_CONF"
      echo "  $BOOT_CONF: gpu_mem=256 eklendi (video oynatma için)."
    else
      echo "  $BOOT_CONF: gpu_mem zaten ayarlı."
    fi
    break
  fi
done

# --- Konsol: tty2'de (Ctrl+Alt+F2) ---
echo ""
echo "[7/9] Konsol erişimi: Ctrl+Alt+F2 (tty2)."

# --- Player launcher: sunucu erişilebilir olana kadar bekler, sonra Chromium açar ---
echo ""
echo "[8/9] Player launcher ve config yazılıyor..."
mkdir -p /home/"$KIOSK_USER"/.config/ariopi
cat > /home/"$KIOSK_USER"/.config/ariopi/player-url << ARIOCONF
PLAYER_URL=$PLAYER_URL
CHROMIUM_CMD=$CHROMIUM_CMD
ARIOCONF
chown -R "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.config/ariopi

LAUNCHER="/home/$KIOSK_USER/ariopi-launch-player.sh"
cat > "$LAUNCHER" << 'LAUNCHEOF'
#!/bin/bash
CONF="$HOME/.config/ariopi/player-url"
LOG=/tmp/ariopi-startx.log
[ -f "$CONF" ] && . "$CONF"
[ -z "$PLAYER_URL" ] && PLAYER_URL="http://localhost:3000/player/"
[ -z "$CHROMIUM_CMD" ] && command -v chromium-browser &>/dev/null && CHROMIUM_CMD=chromium-browser || CHROMIUM_CMD=chromium

echo "=== ArioPi launcher $(date) ===" >> "$LOG"
echo "Hedef: $PLAYER_URL (once sunucuya erisim bekleniyor)" >> "$LOG"
for i in $(seq 1 40); do
  if curl -s -o /dev/null -f --connect-timeout 4 "$PLAYER_URL" 2>/dev/null; then
    echo "Sunucu ulasilir, Player aciliyor." >> "$LOG"
    exec "$CHROMIUM_CMD" --kiosk --noerrdialogs --disable-infobars --no-first-run \
      --autoplay-policy=no-user-gesture-required --disable-session-crashed-bubble \
      --check-for-update-interval=31536000 --disable-backgrounding-occluded-windows \
      "$PLAYER_URL"
  fi
  sleep 2
done
echo "Uyari: Sunucu timeout, yine de Player aciliyor." >> "$LOG"
exec "$CHROMIUM_CMD" --kiosk --noerrdialogs --disable-infobars --no-first-run \
  --autoplay-policy=no-user-gesture-required --disable-session-crashed-bubble \
  --check-for-update-interval=31536000 --disable-backgrounding-occluded-windows \
  "$PLAYER_URL"
LAUNCHEOF
chmod +x "$LAUNCHER"
chown "$KIOSK_USER":"$KIOSK_USER" "$LAUNCHER"
echo "  Launcher: $LAUNCHER (sunucu erisilebilir olunca Chromium acar)"

echo ""
echo "=============================================="
echo "  Pi kurulumu tamamlandi. Sistem ve kiosk hazir."
echo "=============================================="
echo "Kurulanlar: Xorg, Openbox, Chromium, autologin, startx wrapper, HDMI/GPU ayarlari."
echo "Acilista otomatik: tty1'de giris -> startx -> Openbox -> Chromium kiosk (Player URL)."
echo ""
echo "Player URL: $PLAYER_URL"
echo "Konsol erisimi: Ctrl+Alt+F2 (tty2)."
echo ""
echo "Chromium ekrana gelmezse: SSH ile  cat /tmp/ariopi-startx.log"
echo "Sunucunun Pi'ye erisilebilir oldugundan emin olun. Son adim:  sudo reboot"
echo ""
