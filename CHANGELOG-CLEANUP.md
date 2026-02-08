# Temizlik ve GitHub güncellemesi

## Kaldırılan dosya/klasörler

- **admin-dashboard/** — Yinelenen admin; tek admin `admin/` kullanılıyor.
- **player-client/** — Eski/alternatif player; ana oynatıcı `player/`.
- **setup-kiosk.sh** — Eski Chromium kiosk; Pi yolu `scripts/pi/setup.sh` (MPV Lite).
- **scripts/pi/lite/ariopi-signage-ariot.service** — Kullanıcıya özel kopya; `ariopi-signage.service` + setup.sh sed ile yeterli.
- **server/videos/** — Kullanılmıyordu; videolar `server/uploads/` kullanılıyor.

## Güncellenen dosyalar

- **README.md** — Proje yapısı, kurulum özeti, Anthias ve Lite eklendi.
- **scripts/README.md** — HDMI sorun giderme sadeleştirildi.
- **scripts/server/setup.sh** — PUBLIC_URL, gerçek sunucu IP ile .env’e yazılıyor.
- **scripts/pi/setup.sh** — Sunucu adresine otomatik `http://` ekleniyor.

## GitHub’a göndermek için

```bash
cd ariopi
git status
git add -A
git status
git commit -m "Temizlik: admin-dashboard, player-client, setup-kiosk, ariot.service, server/videos kaldırıldı; README ve kurulum scriptleri güncellendi"
git push origin main
```

(Branch adınız `master` ise: `git push origin master`)
