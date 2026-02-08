#!/usr/bin/env python3
"""
ArioPi — Digital Signage player (Raspberry Pi).
Açılışta ekran hazır olana kadar bekler, sonra siyah "bekliyor" ekranı açar; sunucudan video gelince oynatır.
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
WAITING_PNG = "/tmp/ariopi-waiting.png"
LOG_FILE = "/tmp/ariopi-signage.log"  # SSH ile kontrol: cat /tmp/ariopi-signage.log
STARTUP_DELAY = 20  # Boot bittikten, ekran/DRM hazır olsun diye bekle (saniye)
POLL_INTERVAL = 10
REQUEST_TIMEOUT = 8


def log(msg):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    except Exception:
        pass

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
    mpv_vo = config.get("mpv_vo", "auto")  # drm, sdl, auto, rpi, gbm (sdl VT gerektirmez)

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

    def _start_mpv(cmd_list):
        """MPV baslat; basarili Popen veya None doner."""
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as stderr_log:
                p = subprocess.Popen(
                    cmd_list,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=stderr_log,
                    start_new_session=False,
                )
            return p
        except FileNotFoundError:
            log("HATA: mpv bulunamadi. Kurun: sudo apt install mpv")
            return None
        except Exception as e:
            log(f"HATA mpv baslatma: {e}")
            return None

    def play_waiting():
        """Siyah bekleme ekranı (sunucuya bağlanıyor / iç bekleniyor). DRM basarisizsa SDL dene."""
        nonlocal mpv_proc
        kill_mpv()
        ensure_waiting_image()
        for vo in (mpv_vo, "sdl"):
            if vo == "auto":
                vo = "drm"
            cmd = [
                "mpv", "--fs", "--osd-level=0", "--no-input-default-bindings",
                f"--vo={vo}", "--loop=inf", WAITING_PNG,
            ]
            mpv_proc = _start_mpv(cmd)
            if mpv_proc is None:
                continue
            time.sleep(2)
            if mpv_proc.poll() is not None:
                log(f"vo={vo} basarisiz (cikis {mpv_proc.returncode}), digeri deneniyor.")
                mpv_proc.wait()
                mpv_proc = None
                continue
            log(f"play_waiting: mpv baslatildi (vo={vo})")
            return
        log("HATA: mpv drm ve sdl ile baslatilamadi.")

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
        vo = mpv_vo if mpv_vo != "auto" else "drm"
        for try_vo in (vo, "sdl"):
            cmd = [
                "mpv", "--fs", "--osd-level=0", "--no-input-default-bindings",
                "--loop-playlist=inf", f"--vo={try_vo}", "--no-audio-display", url,
            ]
            mpv_proc = _start_mpv(cmd)
            if mpv_proc is None:
                continue
            time.sleep(2)
            if mpv_proc.poll() is not None:
                mpv_proc = None
                continue
            log(f"play_url: mpv baslatildi vo={try_vo}")
            return
        log("HATA: play_url baslatilamadi.")

    def on_sigterm(*_):
        kill_mpv()
        sys.exit(0)

    signal.signal(signal.SIGTERM, on_sigterm)
    signal.signal(signal.SIGINT, on_sigterm)

    # Boot bittikten ve ekran/DRM hazır olsun diye bekle
    log(f"Baslatiliyor; {STARTUP_DELAY}s bekleniyor (ekran hazir olsun)...")
    time.sleep(STARTUP_DELAY)
    log("Bekleme bitti, oynatıcı ekrani aciliyor.")
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
            code = mpv_proc.returncode
            log(f"mpv kapandi (returncode={code}), yeniden baslatiliyor.")
            mpv_proc.wait()  # zombie olmasin
            mpv_proc = None
            current_url = None
            play_waiting()
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
