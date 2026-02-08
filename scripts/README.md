# ArioPi — Kurulum Scriptleri

Bu klasör sunucu ve Raspberry Pi için **interaktif kurulum scriptleri** içerir. Scriptler önce **eski sürüm ve servisleri temizler**, ardından yeni sürümü kurar. IP adresi, port gibi bilgiler çalıştırma sırasında sorulur.

## Dizin yapısı

```
scripts/
├── README.md           # Bu dosya
├── server/
│   └── setup.sh        # Sunucu: eski servis + build temizliği, sonra kurulum
└── pi/
    └── setup.sh        # Pi: eski kiosk servisi temizliği, sonra kurulum
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
| Bind adresi | Dinlenecek adres | 0.0.0.0 |

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
4. **systemd servisi `ariopi-kiosk`** kurulur: xinit ile X + Openbox + Chromium kiosk; açılışta otomatik başlar.
5. Tty1 otomatik giriş (konsol erişimi için).

**İnteraktif sorular:**

| Soru | Açıklama |
|------|----------|
| Sunucu IP adresi | ArioPi sunucusunun IP’si |
| Sunucu port | Sunucu portu (genelde 3000) |

Player URL otomatik: `http://SUNUCU_IP:PORT/player/`

**Kullanım:**

```bash
sudo bash scripts/pi/setup.sh
```

Kurulumdan sonra Pi’yi yeniden başlatın; kiosk systemd ile açılışta başlar.

- **systemd:** `sudo systemctl status ariopi-kiosk` | `start` | `stop` | `restart`
- `sudo reboot`

**Açılışta konsol görünüyorsa (HDMI'da kiosk yok):** Eski kurulumda kiosk vt7'de başlıyordu. Pi'de şunu çalıştırın (kiosk vt1'de, yani HDMI'da açılsın):
```bash
sudo systemctl mask getty@tty1.service
sudo sed -i 's/ vt7$/ vt1/' /etc/systemd/system/ariopi-kiosk.service
sudo systemctl daemon-reload
sudo systemctl restart ariopi-kiosk
sudo reboot
```

---

## Sıralı kurulum özeti

1. **Sunucuda:** `sudo bash scripts/server/setup.sh`  
   - IP ve port girin. Servis kurulur ve açılışta çalışır.

2. **Pi’de:** `sudo bash scripts/pi/setup.sh`  
   - Sunucu IP ve port girin. Servis kurulur. `sudo reboot` yapın.

3. **Kullanım:**  
   - `http://SUNUCU_IP:3000/admin/` → Video yükle, cihaz seç, cihaza gönder / oynat / durdur / sil.  
   - Pi’de TV’de kiosk otomatik açık; yerel videolar burada oynatılır.
