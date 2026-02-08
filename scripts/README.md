# ArioPi — Kurulum Scriptleri

Bu klasör sunucu ve Raspberry Pi için **interaktif kurulum scriptleri** içerir. Scriptler önce **eski sürüm ve servisleri temizler**, ardından yeni sürümü kurar. IP adresi, port gibi bilgiler çalıştırma sırasında sorulur.

## Dizin yapısı

```
scripts/
├── README.md           # Bu dosya
├── server/
│   └── setup.sh        # Sunucu: Node, build, systemd
├── pi/
│   ├── setup.sh        # Pi: Xorg + Chromium kiosk (web player)
│   ├── setup-lite.sh   # Pi Lite: GUI yok, MPV + Python (dijital tabela)
│   └── lite/
│       ├── signage_client.py      # Poll + MPV oynatıcı
│       └── ariopi-signage.service # systemd birimi
```

---

## Sunucu kurulumu (`scripts/server/setup.sh`)

**Nerede çalıştırılır:** ArioPi sunucusu olacak makine (Ubuntu/Debian tabanlı Linux).

**Ne yapar:**

0. **Temizlik:** Eski `ariopi-server` servisini durdurur, devre dışı bırakır, servis dosyasını kaldırır; `node_modules` ve `server/public` build çıktılarını siler.
1. Node.js yoksa kurar (NodeSource 20.x).
2. Server, admin ve player bağımlılıklarını yükler.
3. Admin ve player’ı production için build eder ve `server/public/` altına kopyalar.
4. `server/.env` oluşturur (PORT, BIND).
5. **systemd servisi `ariopi-server`** kurulur ve açılışta başlamak üzere etkinleştirilir.

**İnteraktif sorular:**

| Soru | Açıklama | Varsayılan |
|------|----------|------------|
| Sunucu IP adresi | Bu makinenin ağdaki IP’si (build’de socket URL) | 0.0.0.0 |
| Port | Sunucu portu | 3000 |
| Bind adresi | Dinlenecek adres (bulutta 0.0.0.0) | 0.0.0.0 |

**Bulut:** Sunucu bulutta (örn. 188.132.211.90) ise kurulumda bu IP'yi girin. Pi herhangi bir ağda olabilir; Player `http://SUNUCU_IP:PORT/player/` ile sunucuya internet üzerinden bağlanır.

**Kullanım:**

```bash
sudo bash scripts/server/setup.sh
```

Kurulumdan sonra servis otomatik başlar ve her açılışta çalışır.

- **systemd:** `sudo systemctl status ariopi-server` | `start` | `stop` | `restart`
- Admin: `http://SUNUCU_IP:PORT/admin/`
- Player: `http://SUNUCU_IP:PORT/player/`

---

## Raspberry Pi kurulumu (`scripts/pi/setup.sh`)

**Nerede çalıştırılır:** Raspberry Pi (Raspberry Pi OS Lite önerilir).

**Ne yapar:**

0. **Temizlik:** Eski `ariopi-kiosk` servisini durdurur, devre dışı bırakır, servis dosyasını kaldırır.
1. Paket listesini günceller.
2. Xorg, Openbox, Chromium (veya chromium-browser), unclutter kurar.
3. Openbox autostart’a kiosk komutunu yazar (Player URL scriptte sorulur).
4. **tty1 autologin + .profile ile startx:** Açılışta tty1'de kullanıcı otomatik giriş yapar, startx ile X ve kiosk başlar (HDMI'da görünür).
5. Konsol erişimi: tty2 (Ctrl+Alt+F2).

**İnteraktif sorular:**

| Soru | Açıklama |
|------|----------|
| Sunucu IP adresi | ArioPi sunucusunun IP’si |
| Sunucu port | Sunucu portu (genelde 3000) |

Player URL otomatik: `http://SUNUCU_IP:PORT/player/`

**Pi açılış akışı (mantık):** Pi açıldığında (1) önce verdiğiniz sunucu adresine erişilebilir olana kadar bekler, (2) ardından bu adresteki **Player** sayfasını (Chromium kiosk) açar. Sayfa yüklenince cihaz **kendini sunucuya kaydeder** (Admin’de cihaz listesinde görünür). Sonrasında varsa son oynatılan video otomatik başlar; yoksa “İç bekleniyor” görünür ve Admin’den video gönderip oynatabilirsiniz.

**Kullanım:**

```bash
sudo bash scripts/pi/setup.sh
```

Kurulumdan sonra Pi’yi yeniden başlatın; tty1'de autologin ve startx ile kiosk açılır. Konsol: Ctrl+Alt+F2.

- `sudo reboot`

**Hâlâ konsol görünüyorsa (ariopi-kiosk hata veriyorsa):** Pi'de ariopi-kiosk'u kapatıp autologin + startx kullanın. Kullanıcı adı ariot değilse aşağıdaki ariot'u değiştirin:
```bash
sudo systemctl stop ariopi-kiosk 2>/dev/null
sudo systemctl disable ariopi-kiosk 2>/dev/null
sudo systemctl unmask getty@tty1.service 2>/dev/null
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
printf '[Service]\nExecStart=\nExecStart=-/sbin/agetty --autologin ariot --noclear %%I $TERM\n' | sudo tee /etc/systemd/system/getty@tty1.service.d/autologin.conf
echo 'if [ -z "$DISPLAY" ] && [ "$(tty)" = /dev/tty1 ]; then exec startx; fi' | sudo tee -a /home/ariot/.profile
sudo systemctl daemon-reload
sudo reboot
```

**Chromium hiç ekrana gelmiyor (sadece siyah ekran + yanıp sönen imleç):**

Bu durumda X (grafik ortam) büyük ihtimalle hiç başlamıyor; ekranda gördüğünüz konsol (tty1) veya X’in açılamadığı hâlidir.

1. **Log’a bakın (SSH ile):** Pi’ye SSH ile bağlanıp `cat /tmp/ariopi-startx.log` yazın. Kurulum scripti startx’i bir wrapper ile çalıştırır ve hata çıktısını bu dosyaya yazar. Log’da “startx baslatiliyor” görünüp sonrasında hata varsa, o satırlar X’in neden başlamadığını gösterir.
2. **startx’i elle çalıştırın:** SSH ile giriş yapın. Sonra **Pi’ye klavye ve monitör bağlıyken** Ctrl+Alt+F1 ile tty1’e geçin, kullanıcı adı/şifre ile giriş yapıp `startx` yazın. Ekranda çıkan hata mesajını not alın (ör. “no screens found”, “cannot open display”).
3. **Oturum açılışında startx tetiklensin:** Kurulum scripti hem `.profile` hem `.bash_profile` içine “tty1’de ve DISPLAY yoksa wrapper çalıştır” satırını yazar. Kontrol: `grep ariopi /home/ariot/.profile` ve `grep ariopi /home/ariot/.bash_profile` (kullanıcı adınız farklıysa onu yazın). Wrapper: `ls -la /home/ariot/ariopi-kiosk-startx.sh`. Yoksa kurulumu tekrar çalıştırın: `sudo bash scripts/pi/setup.sh`.
4. **Xorg ve Openbox kurulu mu:** `dpkg -l xorg openbox | grep -E '^ii'`. Eksikse: `sudo apt-get install -y xorg openbox`.
5. **Raspberry Pi OS / imaj:** “Raspberry Pi OS (Legacy)” veya “Lite” kullanın. Yeni “Bookworm Desktop” (Wayland) ile X11 kiosk bazen sorun çıkarır; Lite imajı X11 kullanır.

**Siyah ekran / yanıp sönen imleç (HDMI algılanmıyor vb.):**

1. **HDMI zorla açık:** `/boot/config.txt` veya `/boot/firmware/config.txt` dosyasına (yoksa) `hdmi_force_hotplug=1` ekleyin; kaydedip `sudo reboot`.
2. **Açılışta ağı bekle:** `sudo raspi-config` → Boot → **Wait for network at boot** açın.
3. **Chromium’dan önce bekleme:** `~/.config/openbox/autostart` içinde `sleep 8` değerini 15–20 yapıp deneyin.
4. **X açılmıyorsa:** Yukarıdaki “Chromium hiç ekrana gelmiyor” adımlarını uygulayın; gerekirse `/boot/config.txt` içinde `#dtoverlay=vc4-kms-v3d` satırını yorum satırı yapıp reboot deneyin.

**Video otomatik oynatılmıyor / ekranda video yok (ses var siyah ekran):**

1. **Kurulum scripti (önerilen):** Pi kurulum scripti Chromium’a `--autoplay-policy=no-user-gesture-required` ekler ve `/boot/config.txt`’e `gpu_mem=256` yazar. Yeniden kurulum yapın veya aşağıdakileri elle uygulayın.
2. **Chromium bayrağı:** `~/.config/openbox/autostart` içinde Chromium satırına `--autoplay-policy=no-user-gesture-required` ekleyin (script ile kurulduysa zaten vardır).
3. **GPU bellek:** `/boot/config.txt` veya `/boot/firmware/config.txt`’e `gpu_mem=256` ekleyin (video siyah ekran/performans için sık önerilir). Değişiklikten sonra `sudo reboot`.
4. **Otomatik oynatma (açılışta):** Player, bir kez Admin’den “Oynat” ile oynatılan videoyu hatırlar; Pi yeniden açıldığında aynı video ~1,5 saniye sonra otomatik başlar. İlk seferde Admin’den en az bir kez “Oynat” demeniz gerekir.
5. **Video formatı:** Pi’de donanım desteği için 720p MP4 (H.264) kullanın; daha ağır formatlar takılabilir veya siyah kalabilir.

---

## Pi Lite kurulumu (GUI yok, MPV)

**Ne zaman:** Raspberry Pi OS **Lite** (Xorg/Chromium yok). MPV ile doğrudan HDMI.

- **Kurulum:** `sudo bash scripts/pi/setup-lite.sh` — Sunucu URL ve Player ID (örn. `lite_1`) sorulur.
- **Servis:** `ariopi-signage` (açılışta otomatik). Client sunucudan `GET /api/signage/current?player_id=xxx` poll eder; URL gelince MPV ile oynatır.
- **Oynat:** `curl -X POST http://SUNUCU:3000/api/signage/play -H "Content-Type: application/json" -d '{"player_id":"lite_1","video_id":"VIDEO_ID"}'`
- **Durdur:** `curl -X POST http://SUNUCU:3000/api/signage/stop -H "Content-Type: application/json" -d '{"player_id":"lite_1"}'`
- Config: `/etc/ariopi-signage/config.json`. Gerekirse `mpv_vo`: `rpi` veya `drm`.
- **Eski kurulum:** Script calistirilinca varsa `ariopi-signage` kapatilir; Chromium kiosk icin eklenen startx tetikleyicisi (.profile/.bash_profile) kaldirilir. Sadece Lite (MPV) kullanilir.

---

## Sıralı kurulum özeti

1. **Sunucuda:** `sudo bash scripts/server/setup.sh`  
   - IP/domain ve port girin. Node, server, build, systemd kurulur; ariopi-server açılışta otomatik başlar.

2. **Pi’de:** `sudo bash scripts/pi/setup.sh`  
   - Sunucu IP ve port girin. Xorg, Openbox, Chromium, autologin, HDMI/GPU kurulur; açılışta kiosk otomatik başlar. Son adım: `sudo reboot`.

3. **Kullanım:**  
   - `http://SUNUCU_IP:3000/admin/` → Video yükle, cihaz seç, cihaza gönder / oynat / durdur / sil.  
   - Pi’de TV’de kiosk otomatik açık; yerel videolar burada oynatılır.
