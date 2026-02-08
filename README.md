# ArioPi — Digital Signage

Sunucu merkezli **dijital tabela** sistemi: videoları yönetir, cihazlara veya Anthias ekranlarına gönderir.

## Özellikler

- **Video kütüphanesi:** Video yükle, listele, sil.
- **Cihazlar (Socket.io):** Web/Player veya Lite (MPV) cihazlara video gönder; uzaktan oynat / durdur / sil.
- **Anthias ekranları:** Pi üzerinde Anthias çalışan ekranları merkezden yönet; kütüphanedeki videoyu istediğiniz ekranda oynatın.
- **Lite (MPV):** Pi’de X/Chromium olmadan MPV ile oynatıcı; sunucudan `player_id` ile oynat/durdur.

## Mimari

| Bileşen | Açıklama |
|--------|----------|
| **Server** | Node.js + Express + Socket.io — Video API, kütüphane, cihaz/Anthias yönetimi |
| **Admin** | React + Vite — Video yükle, cihazlar, Anthias ekranları, oynat/durdur |
| **Player** | React + Vite — Tarayıcıda cihaz (IndexedDB, Socket.io) |
| **Pi (Lite)** | MPV + Python — Açılışta ekran, sunucudan poll ile oynat/durdur |
| **Anthias** | İsteğe bağlı — Pi’de Anthias kurulu ekranlar merkezden yönetilir |

## Proje yapısı

```
ariopi/
├── server/           # API + Socket.io (video, cihazlar, Anthias proxy)
├── admin/            # Yönetim paneli (kütüphane, cihazlar, Anthias ekranları)
├── player/           # Web oynatıcı (cihaz tarayıcıda)
├── scripts/
│   ├── server/       # Sunucu kurulum: setup.sh
│   ├── pi/           # Pi kurulum: setup.sh (+ lite: signage_client, systemd)
│   └── README.md     # Kurulum detayı
└── README.md
```

## Kurulum (özet)

| Hedef | Komut |
|-------|--------|
| **Sunucu** | `sudo bash scripts/server/setup.sh` — Node, admin+player build, systemd `ariopi-server` |
| **Raspberry Pi (Lite)** | `sudo bash scripts/pi/setup.sh` — MPV, Python, açılışta oynatıcı, sunucuya kayıt |
| **Anthias ekranları** | Pi’ye Anthias kurun; Admin’de “Anthias ekranları”ndan cihaz adresini ekleyin |

Detaylar: [scripts/README.md](scripts/README.md)

## Çalıştırma (geliştirme)

```bash
# Sunucu
cd server && npm install && npm start

# Admin (ayrı terminal)
cd admin && npm install && npm run dev

# Player (ayrı terminal)
cd player && npm install && npm run dev
```

- Sunucu: `http://localhost:3000`
- Admin: `http://localhost:5173` (veya build sonrası `http://localhost:3000/admin/`)
- Player: `http://localhost:5174` (veya `http://localhost:3000/player/`)

## Ortam değişkenleri

| Değişken | Bileşen | Açıklama |
|----------|---------|----------|
| `PORT` | server | Port (varsayılan: 3000) |
| `BIND` | server | Dinlenecek adres (varsayılan: 0.0.0.0) |
| `PUBLIC_URL` | server | Reverse proxy için indirme adresi (örn. `http://188.132.211.90:3000`) |
| `VITE_SOCKET_URL` | admin, player | Build’de sunucu adresi |

---

**Repo:** [github.com/rifatsekerariot/ariopi](https://github.com/rifatsekerariot/ariopi)
