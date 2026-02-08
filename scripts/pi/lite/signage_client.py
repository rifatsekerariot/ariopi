#!/usr/bin/env python3
"""
ArioPi — Digital Signage player (Raspberry Pi).
Açılışta hemen siyah "bekliyor" ekranı açar (tty görünmez), sunucudan video gelince oynatır.
"""
import base64
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
import urllib.error

CONFIG_DIR = os.environ.get("ARIOPI_LITE_CONFIG", "/etc/ariopi-signage")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
WAITING_PNG = "/tmp/ariopi-waiting.png"  # 1x1 siyah PNG, açılışta ekranı kaplar
POLL_INTERVAL = 10
REQUEST_TIMEOUT = 8

def load_config():
    path = CONFIG_FILE
    if not os.path.isfile(path):
        path = os.path.expanduser("~/.config/ariopi-signage/config.json")
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def get_current_media(server_url, player_id):
    url = f"{server_url.rstrip('/')}/api/signage/current?player_id={player_id}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as r:
            if r.status == 204:
                return None
            data = json.loads(r.read().decode())
            return data.get("url")
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError):
        return None

def main():
    config = load_config()
    if not config:
        print("Hata: config bulunamadi. Ornek: " + CONFIG_FILE, file=sys.stderr)
        sys.exit(1)
    server_url = config.get("server_url", "").rstrip("/")
    player_id = config.get("player_id", "lite_1")
    mpv_vo = config.get("mpv_vo", "auto")  # auto, drm, rpi, gbm

    if not server_url:
        print("Hata: config'ta server_url gerekli.", file=sys.stderr)
        sys.exit(1)

    current_url = None
    mpv_proc = None

    # Açılışta hemen siyah ekran göster (tty görünmesin)
    def ensure_waiting_image():
        if not os.path.isfile(WAITING_PNG):
            # 1x1 siyah PNG (minimal)
            b = base64.b64decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEBgIApD5fRAAAAABJRU5ErkJggg=="
            )
            with open(WAITING_PNG, "wb") as f:
                f.write(b)

    def play_waiting():
        """Siyah bekleme ekranı (sunucuya bağlanıyor / iç bekleniyor)."""
        nonlocal mpv_proc
        kill_mpv()
        ensure_waiting_image()
        cmd = [
            "mpv",
            "--fs",
            "--no-osd",
            "--no-input-default-bindings",
            f"--vo={mpv_vo}",
            "--loop=inf",
            WAITING_PNG,
        ]
        try:
            mpv_proc = subprocess.Popen(
                cmd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except FileNotFoundError:
            pass

    def kill_mpv():
        nonlocal mpv_proc
        if mpv_proc and mpv_proc.poll() is None:
            mpv_proc.terminate()
            try:
                mpv_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                mpv_proc.kill()
        mpv_proc = None

    def play_url(url):
        nonlocal mpv_proc
        kill_mpv()
        cmd = [
            "mpv",
            "--fs",
            "--no-osd",
            "--no-input-default-bindings",
            "--loop-playlist=inf",
            f"--vo={mpv_vo}",
            "--no-audio-display",
            url,
        ]
        try:
            mpv_proc = subprocess.Popen(
                cmd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except FileNotFoundError:
            print("Hata: mpv bulunamadi. Kurun: sudo apt-get install mpv", file=sys.stderr)

    def on_sigterm(*_):
        kill_mpv()
        sys.exit(0)

    signal.signal(signal.SIGTERM, on_sigterm)
    signal.signal(signal.SIGINT, on_sigterm)

    # İlk açılışta hemen ekranı al (tty görünmesin)
    play_waiting()

    while True:
        url = get_current_media(server_url, player_id)
        if url != current_url:
            current_url = url
            if url:
                play_url(url)
            else:
                play_waiting()
        if mpv_proc and mpv_proc.poll() is not None:
            mpv_proc = None
            current_url = None
            play_waiting()
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
