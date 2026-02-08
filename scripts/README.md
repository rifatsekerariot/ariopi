# ArioPi — Kurulum

**İki script:** Sunucu için bir, Pi için bir. Hepsi bu.

## 1. Sunucu kurulumu

**Nerede:** Sunucu olacak makine (Ubuntu/Debian veya bulut).

```bash
cd ariopi
sudo bash scripts/server/setup.sh
```

Sorulacaklar: **Sunucu IP veya domain** (bulutta örn. 188.132.211.90), **port** (3000), **bind** (0.0.0.0).  
Kurulum: Node.js, server, admin/player build, systemd servisi `ariopi-server`. Açılışta otomatik başlar.

- Admin: `http://SUNUCU_IP:3000/admin/`
- Servis: `sudo systemctl status ariopi-server`

---

## 2. Raspberry Pi kurulumu

**Nerede:** Raspberry Pi (Raspberry Pi OS **Lite** önerilir).

```bash
cd ariopi
sudo bash scripts/pi/setup.sh
```

Sorulacaklar: **Sunucu adresi** (örn. http://188.132.211.90:3000), **Player ID** (örn. pi_1).  
Kurulum: mpv, Python, oynatıcı uygulaması, systemd servisi. **Konsol (tty) kapatılır**; açılışta sadece oynatıcı ekranı (önce siyah “bekliyor”, sunucu online olunca kayıt olur) görünür.

Son adım: **`sudo reboot`**

---

## Kullanım

1. Sunucuda Admin’i aç: `http://SUNUCU_IP:3000/admin/` → Video yükle (kütüphaneye girer).
2. Pi’de video oynatmak: Sunucudan veya herhangi bir makineden:
   ```bash
   curl -X POST http://SUNUCU_IP:3000/api/signage/play \
     -H "Content-Type: application/json" \
     -d '{"player_id":"pi_1","video_id":"VIDEO_ID"}'
   ```
   `VIDEO_ID` = Admin’deki kütüphanede videonun ID’si (yükledikten sonra listede görünür).
3. Durdurmak:
   ```bash
   curl -X POST http://SUNUCU_IP:3000/api/signage/stop \
     -H "Content-Type: application/json" \
     -d '{"player_id":"pi_1"}'
   ```

---

## Dizin yapısı

```
scripts/
├── README.md       # Bu dosya
├── server/
│   └── setup.sh    # Sunucu kurulumu (tek script)
└── pi/
    ├── setup.sh    # Pi kurulumu (tek script)
    └── lite/       # Oynatıcı dosyaları (setup.sh bunları kullanır)
        ├── signage_client.py
        └── ariopi-signage.service
```

---

## Sorun giderme

- **Pi’de hâlâ tty/konsol görünüyor:** Kurulumu tekrar çalıştırıp `sudo reboot` yapın. `getty@tty1` script ile kapatılıyor; bazen ilk kurulumda etkisi reboot’tan sonra olur.
- **Video oynatılmıyor:** Pi’de `sudo systemctl status ariopi-signage`. Config: `/etc/ariopi-signage/config.json` (server_url, player_id). Video formatı: 720p MP4 (H.264) önerilir.
- **HDMI siyah:** `/boot/config.txt` veya `/boot/firmware/config.txt` içinde `hdmi_force_hotplug=1` ve `gpu_mem=256` olsun (script ekliyor; reboot gerekir).
