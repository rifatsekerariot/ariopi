# ArioPi — Digital Signage

WebRTC ve Socket.io ile **webcam’i veya video dosyasını** Raspberry Pi’ye (TV’ye bağlı) canlı yayınlayan basit, sorunsuz bir dijital tabela sistemi.

## Mimari

| Bileşen | Açıklama |
|--------|----------|
| **Server** | Node.js + Express + Socket.io (WebRTC sinyalleme) |
| **Admin** | React + Vite — Hangi Pi’ye yayın yapılacağını seçer, “Start Stream” ile webcam’i açar |
| **Player** | React + Vite — Pi’de/TV’de çalışır; gelen yayını tam ekran gösterir |

## Teknolojiler

- **Runtime:** Node.js  
- **Frontend:** React, Tailwind CSS, Vite  
- **İletişim:** Socket.io (oda/sinyal), simple-peer (WebRTC)

## Proje yapısı

```
ariopi/
├── server/           # Sinyal sunucusu (join-room, call-user, answer-call, ice-candidate)
├── admin/            # Yönetim paneli (cihaz listesi, Start Stream)
├── player/           # Pi/TV oynatıcı (otomatik bağlanma, tam ekran video)
├── setup-kiosk.sh    # Raspberry Pi OS Lite için kiosk kurulumu
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

Tarayıcıda `http://localhost:5173` açın. Bağlı oynatıcıları görüp birini seçin ve **Start Stream** ile webcam’i o Pi’ye gönderin.

### 3. Oynatıcı (Player)

**Geliştirme (aynı makine):**

```bash
cd player
npm install
npm run dev
```

`http://localhost:5174` — Admin’den bu adrese yayın hedeflenebilir (aynı ağda ise IP:5174 kullanın).

**Production (Pi’de göstermek için):** Player’ı build edip bir web sunucusunda yayınlayın; Pi’de bu URL’yi açın veya kiosk script’inde kullanın.

```bash
cd player
npm run build
# dist/ çıktısını nginx, Express static vb. ile servis edin
```

## Raspberry Pi kiosk kurulumu (Pi OS Lite)

Pi’de tarayıcıyı tam ekran kiosk modunda, Player URL’sine yönlendirmek için:

1. Player uygulamasının erişilebilir URL’sini belirleyin (örn. `http://SUNUCU_IP:5174` veya sunucunuzda servis ettiğiniz player build’i).

2. Script’i indirip çalıştırın:

```bash
export PLAYER_URL=http://SUNUCU_IP:5174
sudo -E bash setup-kiosk.sh
```

3. Pi’yi yeniden başlatın. Konsol girişinde (tty1) otomatik olarak X + Openbox + Chromium kiosk açılır; imleç gizlenir (unclutter).

**Kurulanlar:** xorg, openbox, chromium-browser, unclutter.

## Sinyal akışı (WebRTC)

1. Player bağlanır → `join-room` (`room: 'player'`, `playerId`) → sunucu listeyi admin’e gönderir.  
2. Admin “Start Stream” → `getUserMedia` → simple-peer (initiator) → ilk sinyal `call-user` ile player’a iletilir.  
3. Player `incoming-call` alır → cevap üretir → `answer-call` ile admin’e gönderir.  
4. ICE adayları `ice-candidate` ile iki yönlü iletilir.  
5. Bağlantı kurulunca video Player’da tam ekran (muted, playsInline) oynar.

## Ortam değişkenleri

| Değişken | Bileşen | Açıklama |
|----------|---------|----------|
| `PORT` | server | Sunucu portu (varsayılan: 3000) |
| `VITE_SOCKET_URL` | admin, player | Socket.io sunucu adresi (örn. `http://192.168.1.10:3000`) |
| `PLAYER_URL` | setup-kiosk.sh | Kiosk’ta açılacak Player sayfası URL’si |

## Lisans

MIT.

---

**Repo:** [github.com/rifatsekerariot/ariopi](https://github.com/rifatsekerariot/ariopi)
