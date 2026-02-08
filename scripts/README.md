# ArioPi — Kurulum Scriptleri

Bu klasör sunucu ve Raspberry Pi için **interaktif kurulum scriptleri** içerir. IP adresi, port gibi bilgiler script çalıştırılırken sorulur.

## Dizin yapısı

```
scripts/
├── README.md           # Bu dosya
├── server/
│   └── setup.sh        # Sunucu kurulumu (Node, admin/player build, .env, isteğe bağlı systemd)
└── pi/
    └── setup.sh        # Raspberry Pi kiosk kurulumu (Xorg, Openbox, Chromium)
```

---

## Sunucu kurulumu (`scripts/server/setup.sh`)

**Nerede çalıştırılır:** ArioPi sunucusu olacak makine (Ubuntu/Debian tabanlı Linux).

**Ne yapar:**

1. Node.js yoksa kurar (NodeSource 20.x).
2. Server, admin ve player bağımlılıklarını yükler.
3. Admin ve player’ı production için build eder ve `server/public/` altına kopyalar.
4. `server/.env` oluşturur (PORT, BIND).
5. İsteğe bağlı: systemd servisi (`ariopi-server`) ekler.

**İnteraktif sorular:**

| Soru | Açıklama | Varsayılan |
|------|----------|------------|
| Sunucu IP adresi | Bu makinenin ağdaki IP’si (admin/player build’de socket URL için kullanılır) | 0.0.0.0 |
| Port | Sunucu portu | 3000 |
| Bind adresi | Dinlenecek adres (tüm ağ: 0.0.0.0) | 0.0.0.0 |
| systemd servisi | Açılışta otomatik başlasın mı? | Hayır |

**Kullanım:**

```bash
# Proje kök dizininden
sudo bash scripts/server/setup.sh

# veya scripts/server içinden
cd scripts/server && sudo bash setup.sh
```

Kurulumdan sonra:

- Admin: `http://SUNUCU_IP:PORT/admin/`
- Player: `http://SUNUCU_IP:PORT/player/`
- Sunucuyu başlatmak: `cd server && npm start` (veya `sudo systemctl start ariopi-server`)

---

## Raspberry Pi kurulumu (`scripts/pi/setup.sh`)

**Nerede çalıştırılır:** Raspberry Pi (Raspberry Pi OS Lite önerilir).

**Ne yapar:**

1. Paket listesini günceller.
2. Xorg, Openbox, Chromium (veya chromium-browser), unclutter kurar.
3. Openbox autostart’a kiosk komutunu yazar (Player URL’si scriptte sorulur).
4. Tty1 otomatik giriş ve konsolda `startx` ile X + kiosk başlatmayı ayarlar.

**İnteraktif sorular:**

| Soru | Açıklama |
|------|----------|
| Sunucu IP adresi | ArioPi sunucusunun IP’si |
| Sunucu port | Sunucu portu (genelde 3000) |

Player URL otomatik oluşturulur: `http://SUNUCU_IP:PORT/player/`

**Kullanım:**

```bash
# Proje kök dizininden (veya script’in bulunduğu yerden)
sudo bash scripts/pi/setup.sh
```

Kurulumdan sonra Pi’yi yeniden başlatın; tty1’de otomatik giriş yapılıp Chromium kiosk modunda Player sayfası açılır:

```bash
sudo reboot
```

---

## Sıralı kurulum özeti

1. **Sunucuda:** `sudo bash scripts/server/setup.sh`  
   - Sunucu IP’sini ve portu girin.  
   - Kurulum bitince `cd server && npm start` (veya systemd ile başlatın).

2. **Pi’de:** `sudo bash scripts/pi/setup.sh`  
   - Sunucu IP ve portu girin (Player URL buna göre ayarlanır).  
   - `sudo reboot` ile Pi’yi yeniden başlatın.

3. **Kullanım:**  
   - Bilgisayardan `http://SUNUCU_IP:3000/admin/` ile admin panelini açın, bir Player seçip “Start Stream” ile yayın başlatın.  
   - Pi’de TV’de Player sayfası açık olacak ve yayın otomatik görüntülenir.
