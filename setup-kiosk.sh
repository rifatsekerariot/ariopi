#!/bin/bash
# setup-kiosk.sh — Raspberry Pi OS Lite: minimal GUI + Chromium kiosk for Digital Signage Player
# Run with: sudo bash setup-kiosk.sh

set -e

PLAYER_URL="${PLAYER_URL:-http://YOUR_SERVER_IP:5174}"
KIOSK_USER="${SUDO_USER:-pi}"

echo "[1/5] Updating package list..."
apt-get update -qq

echo "[2/5] Installing minimal GUI and Chromium..."
apt-get install -y --no-install-recommends \
  xorg \
  openbox \
  chromium-browser \
  unclutter \
  xdotool

echo "[3/5] Creating Openbox autostart for kiosk..."
mkdir -p /home/"$KIOSK_USER"/.config/openbox
cat > /home/"$KIOSK_USER"/.config/openbox/autostart << EOF
# Hide mouse cursor after 0.5s idle
unclutter -idle 0.5 -root &

# Start Chromium in kiosk mode (no decorations, fullscreen, no cursor)
chromium-browser \\
  --kiosk \\
  --noerrdialogs \\
  --disable-infobars \\
  --no-first-run \\
  --disable-session-crashed-bubble \\
  --check-for-update-interval=31536000 \\
  "$PLAYER_URL"
EOF
chown -R "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.config/openbox

echo "[4/5] Enabling autologin and boot to GUI (optional)..."
# Raspberry Pi OS: use raspi-config or create/getty override
if [ -d /etc/systemd/system/getty@tty1.service.d ]; then
  mkdir -p /etc/systemd/system/getty@tty1.service.d
  cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << 'GETTY'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin pi --noclear %I \$TERM
GETTY
fi
# Start X as the kiosk user on tty1 (add to .profile or use a display manager)
if ! grep -q 'startx' /home/"$KIOSK_USER"/.profile 2>/dev/null; then
  echo '' >> /home/"$KIOSK_USER"/.profile
  echo '# Start kiosk on console login' >> /home/"$KIOSK_USER"/.profile
  echo 'if [ -z "$DISPLAY" ] && [ "$(tty)" = /dev/tty1 ]; then startx; fi' >> /home/"$KIOSK_USER"/.profile
  chown "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.profile
fi

echo "[5/5] Configuring default startx to run openbox..."
echo 'exec openbox-session' > /home/"$KIOSK_USER"/.xinitrc
chown "$KIOSK_USER":"$KIOSK_USER" /home/"$KIOSK_USER"/.xinitrc

echo "Done. Set PLAYER_URL before running if needed:"
echo "  export PLAYER_URL=http://YOUR_SERVER:5174"
echo "  sudo -E bash setup-kiosk.sh"
echo "Then reboot. On next login from tty1, Openbox will start and Chromium will open in kiosk mode."
