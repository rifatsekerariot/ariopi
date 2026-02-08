# ArioPi — Digital Signage

Sunucu merkezli **dijital tabela** sistemi: videoları yönetir, cihazlara gönderir; cihazda **yerel** depolama ve oynatma (canlı yayın yok).

## Özellikler

- **Video kütüphanesi:** Bilgisayardan video yükle, sunucuda listele, sunucudan sil.
- **Cihaza gönder:** Seçili videoyu seçili oynatıcıya gönder; cihaz indirip **kendi hafızasında** (IndexedDB) saklar.
- **Oynat / Durdur / Sil:** Sunucudan tek tıkla cihazda oynat, durdur veya cihazdaki videoyu sil.
- **Minimum signage ihtiyaçları:** Yönetim paneli, cihaz listesi, içerik atama, uzaktan oynat/durdur/sil.

## Mimari

| Bileşen | Açıklama |
|--------|----------|
| **Server** | Node.js + Express + Socket.io — Video yükleme API’si, kütüphane, cihaza gönderme ve komut iletimi |
| **Admin** | React + Vite — Video yükle, kütüphaneden cihaza gönder, cihazda oynat/durdur/sil |
| **Player** | React + Vite — Cihazda (Pi/TV) çalışır; videoları yerel depoda tutar, sunucudan gelen komutlarla oynatır/durdurur/siler |

## Teknolojiler

- **Runtime:** Node.js  
- **Frontend:** React, Tailwind CSS, Vite  
- **İletişim:** Socket.io  
- **Cihaz depolama:** Tarayıcı IndexedDB (kalıcı, cihaza özel)

## Proje yapısı

```
ariopi/
├── server/           # API (video upload/list/file/delete) + Socket.io (komutlar)
├── admin/            # Yönetim paneli (kütüphane, cihazlar, gönder/oynat/durdur/sil)
├── player/           # Cihaz oynatıcı (IndexedDB, oynat/durdur/sil)
├── scripts/          # Kurulum scriptleri (sunucu + Pi)
└── README.md
```

## Çalıştırma

### 1. Sunucu

```bash
cd server
npm install
npm start
```

Varsayılan: `http://localhost:3000`

### 2. Admin paneli

```bash
cd admin
npm install
npm run dev
```

Tarayıcıda `http://localhost:5173` — Video yükle, cihaz seç, “Cihaza gönder” / “Oynat” / “Durdur” / “Sil”.

### 3. Oynatıcı (Player)

```bash
cd player
npm install
npm run dev
```

`http://localhost:5174` — Cihaz burada kayıt olur; sunucudan gelen videolar yerelde saklanır ve komutlarla oynatılır/durdurulur/silinir.

## Akış

1. Admin video yükler → sunucu `uploads/` ve kütüphaneye ekler.  
2. Admin bir cihaz seçer, kütüphaneden “Cihaza gönder” der → sunucu cihaza “şu URL’den indir ve sakla” komutunu iletir → cihaz indirip IndexedDB’ye yazar.  
3. Admin “Oynat” der → sunucu cihaza “şu videoyu oynat” iletir → cihaz yerel depodan oynatır.  
4. Admin “Durdur” veya “Sil” der → cihaz durdurur veya yerel dosyayı siler.

## Kurulum scriptleri

- **Sunucu:** `sudo bash scripts/server/setup.sh` — Node, build, systemd.  
- **Pi:** `sudo bash scripts/pi/setup.sh` — Kiosk (Chromium + Openbox), systemd.  

Ayrıntılar: [scripts/README.md](scripts/README.md)

## Ortam değişkenleri

| Değişken | Bileşen | Açıklama |
|----------|---------|----------|
| `PORT` | server | Sunucu portu (varsayılan: 3000) |
| `BIND` | server | Dinlenecek adres (varsayılan: 0.0.0.0) |
| `VITE_SOCKET_URL` | admin, player | Sunucu adresi (örn. `http://192.168.1.10:3000`) |
| `PLAYER_URL` | setup-kiosk.sh | Kiosk’ta açılacak Player URL’si |

---

**Repo:** [github.com/rifatsekerariot/ariopi](https://github.com/rifatsekerariot/ariopi)
