# SANCTARA — Tam Sistem Mimarisi & Bug Teşhisi (ChatGPT Handoff)

> Bu dokümanı ChatGPT/Claude/Gemini'ye olduğu gibi yapıştır. İçinde her dosyanın
> ne yaptığı, hangi sorunla karşı karşıya olduğumuz ve nereye bakılması gerektiği yazılı.

---

## 1. ÜRÜN ÖZETİ

**Sanctara** — Pi-Network tarzı mobil madencilik uygulaması.
- Kullanıcı telefondaki APK'yı veya tarayıcı PWA'sını açar.
- APK gerçek RandomX (XMR/Monero) madenciliği yapar (`librandomx.so`).
- PWA sadece "drip" tabanlı sanal SANCT token kazanır (gerçek mining YOK — tarayıcı sandbox sınırı).
- Tüm aktif cihazlar admin panelinde "MOBILE COMPUTE" sayacında listelenmeli.

---

## 2. ALT YAPI

| Bileşen | Konum | Görev |
|---|---|---|
| Backend | FastAPI / Python 3, VPS (Contabo) | API, MongoDB Atlas okuma/yazma, JWT auth |
| Frontend | React 18 (CRA), Caddy reverse proxy | Web UI + PWA mobil sayfa |
| Database | MongoDB Atlas | users, devices, mining_config |
| Android APK | Java + JNI (NDK r28) | Foreground service + librandomx RandomX engine |
| CI/CD | GitHub Actions | librandomx.so build + APK derleme + GitHub Releases |
| Deploy | VPS bash script (`sanctara-update.sh`) | git pull + APK download + service restart |

---

## 3. ANA DOSYA HARİTASI

### Backend
- `/app/backend/server.py` — Tek monolit (~5300 satır). TÜM endpoint'ler burada.
  - **Önemli endpoint'ler:**
    - `POST /api/auth/login` — JWT login (satır ~150-220)
    - `POST /api/devices/heartbeat` — Telefon her 10s bunu çağırır (satır ~1007-1080)
    - `POST /api/node/drip` — Her ~30s, SANCT drip kazanır (satır ~2212-2330)
    - `GET /api/admin/mobile-mining/metrics` — Admin panel için (satır ~4130-4220) **← Yeni eklenen endpoint**
    - `GET /api/stats/public` — Public landing istatistikleri
    - `GET /api/apk/version` — Telefon update kontrolü
  - **DB collections:**
    - `users`: `{id, email, password_hash, tgc_balance, device_tier}`
    - `devices`: `{id, device_id, user_id, last_heartbeat, last_drip_at, native_pow, local_hashrate_hps, client_type, mining_status, mining_requested, native_lib_loaded, accepted_shares}`
    - `mining_config`: `{id="global", max_threads, min_battery_pct}`

### Frontend (React)
- `/app/frontend/src/pages/Mobile.jsx` — PWA mobil sayfa. `/api/node/drip` ile SANCT drip alır.
- `/app/frontend/src/pages/Admin.jsx` — Admin panel ana sayfa.
- `/app/frontend/src/components/MobileMiningMetricsCard.jsx` — Admin panelde "MOBILE COMPUTE" kutusu. `/api/admin/mobile-mining/metrics` çağırır.
- `/app/frontend/src/components/WeaponDeployBanner.jsx` — APK indirme banner'ı.
- `/app/frontend/src/lib/api.js` — Axios setup, JWT interceptor.
- `/app/frontend/src/contexts/AuthContext.jsx` — Auth state.

### Android APK
- `/app/android-client/jni/randomx_jni.cpp` — RandomX C++ JNI bridge.
  - **Kritik:** VM JIT+SECURE flag'leriyle yaratılmalı (yoksa 2 H/s interpreter modu).
  - **v1.8.1 fix:** Per-thread atomic hashrate (eski kod tüm thread'ler aynı atomic'e yazıyordu → tek thread sayılıyordu).
- `/app/android-client/wrapper/src/io/thegrid/worker/GridWorkerService.java` — Foreground service.
  - `ECO_THREADS = 1`, `FULL_THREADS = 2`, `BATTERY_FLOOR_PCT = 25`.
  - Şarjda → FULL, pilde → ECO veya pause.
- `/app/android-client/wrapper/src/io/thegrid/worker/RandomXBridge.java` — JNI loader.
- `/app/android-client/wrapper/src/io/thegrid/worker/MainActivity.java` — UI activity, START/STOP butonları.
- `/app/android-client/build-apk.sh` — Bash build script. APK'ya librandomx.so embed eder (Python zipfile ile UNCOMPRESSED, çünkü Android öyle ister).

### CI/CD
- `/app/.github/workflows/build-librandomx.yml` — `randomx_jni.cpp` değişirse otomatik tetiklenir, `.so` derler, repoya commit eder.
- `/app/.github/workflows/build-apk.yml` — `.so` veya wrapper değişirse APK'ları derler, **GitHub Releases'a (tag: `latest`) atar**.

### Deploy
- `/app/sanctara-update.sh` — VPS update script.
  - `cd /root/sanctara && git pull origin main`
  - `curl` ile GitHub Releases'tan APK indirir
  - Caddy + backend restart

---

## 4. KRİTİK BUG (ÇÖZÜLEMEYEN)

### Belirtiler
1. **Telefonun pool'da kazımı çalışıyor** — supportxmr.com'da 100-280 H/s görünüyor, valid shares geliyor.
2. **Backend log'da `POST /api/devices/heartbeat HTTP/1.1 200 OK`** — heartbeat ulaşıyor.
3. **AMA admin panelde "MOBILE COMPUTE: 0 H/s, 0 phones"** veya **"1 phone, 2.6 H/s"** (gerçek hashrate'ten çok düşük).
4. Kullanıcı şikayeti: *"Telefon admin'de görününce worker kayboluyor, worker'da görününce admin'de kayboluyor."*

### Olası kök neden hipotezleri

#### H1: `last_heartbeat` veri tipi tutarsız
- DB'de string (`"2026-05-24T09:52:31.234070+00:00"`) olarak saklanıyor.
- Yeni `/admin/mobile-mining/metrics` endpoint'i string karşılaştırması yapıyor (`cutoff_iso`).
- Eski endpoint'ler ve `check_devices.py` script datetime karşılaştırması yapıyor → string vs datetime karşılaştırması MongoDB'de SİLENT FAİL eder (filter eşleşmez).

#### H2: Heartbeat per-thread hashrate toplama hatası (KISMEN FIX EDİLDİ ama belki yeterli değil)
- `randomx_jni.cpp` eski versiyonda tüm thread'ler aynı `g.hashrate` atomic'e yazıyordu → tek thread'in değeri raporlanıyordu (örn. 2 thread × 140 H/s = 280 H/s ama backend 140 H/s görüyordu).
- **v1.8.1'de düzeltildi**: per-thread atomic slot'lar (`g.thread_hashrate[MAX_THREADS]`), `nativeGetHashrate()` sum dönüyor.
- **Şüphe:** Yeni librandomx.so APK'ya doğru embed olmuş mu? `unzip -l sanctara-node-pro.apk | grep librandomx` ile kontrol edilebilir.

#### H3: PWA ve APK aynı user_id ile çakışıyor
- Aynı kullanıcı tarayıcıdan PWA açarsa + APK'dan da girerse, aynı `user_id` altında farklı `device_id`'lerle 2 cihaz oluşur.
- Bir tanesi heartbeat gönderir, diğeri sadece drip → admin panel sadece birini sayabilir.

#### H4: Worker name "THEGRID_WEAPON" — eski rebrand kalıntısı
- Pool'da worker adı hâlâ `THEGRID_WEAPON` (rebranding öncesi).
- Backend belki worker_name değişimi sırasında telefonu farklı kayıt olarak görüyor.

### Şu ana kadar yapılan düzeltmeler
- `randomx_jni.cpp`: JIT+SECURE VM flags, per-thread atomic hashrate ✅
- `build-apk.sh`: REPO_ROOT bash source ile çözüldü, Python zipfile ile librandomx.so embed ✅
- `build-librandomx.yml`: Otomatik tetik + commit-back ✅
- `build-apk.yml`: GitHub Releases'a push ✅
- `sanctara-update.sh`: Branch tracking, conflict resolution, Release download ✅
- `server.py /admin/mobile-mining/metrics`: Yeni endpoint, string compare, drip OR heartbeat sayımı ✅
- `server.py /node/drip`: `last_drip_at` upsert ✅

### Sıradaki teşhis adımları
1. **DB content kanıtı**: 
   ```python
   from datetime import datetime, timezone
   from pymongo import MongoClient
   m = MongoClient(MONGO_URL); db = m[DB_NAME]
   for d in db.devices.find().sort("last_heartbeat", -1).limit(3):
       print(type(d.get("last_heartbeat")), d.get("last_heartbeat"))
   ```
   → `last_heartbeat` `str` mi `datetime` mi?

2. **Backend log gerçek heartbeat payload'u**:
   ```bash
   journalctl -u sanctara-backend --since "2 minutes ago" | grep -A 5 "heartbeat" 
   ```
   → Hangi `device_id`, `local_hashrate_hps`, `native_pow` değerleri geliyor?

3. **APK içinde librandomx kontrolü**:
   ```bash
   unzip -l /root/sanctara/frontend/public/sanctara-node-pro.apk | grep -E "librandomx|\.so"
   ```
   → 1.2 MB civarı olmalı.

4. **Endpoint çıktısı**:
   ```bash
   TOKEN=$(curl -sX POST https://sanctara.io/api/auth/login \
       -H "Content-Type: application/json" \
       -d '{"email":"admin@thegrid.io","password":"Grid@Admin2026"}' | jq -r .token)
   curl -s "https://sanctara.io/api/admin/mobile-mining/metrics" \
       -H "Authorization: Bearer $TOKEN" | jq
   ```

---

## 5. ÇALIŞMA ORTAMI

- **VPS**: Contabo, Ubuntu 22, root@vmi3317441
- **Backend service**: `systemctl status sanctara-backend` (uvicorn, /root/sanctara/backend/.venv)
- **Caddy**: reverse proxy + Let's Encrypt SSL
- **MongoDB**: Atlas (URL `.env` içinde)
- **Domain**: sanctara.io
- **GitHub repo**: `derdapc-crypto/kral` (branch: `main`)
- **Admin credentials**: `admin@thegrid.io` / `Grid@Admin2026`
- **Pool**: supportxmr.com, worker tag `THEGRID_WEAPON`

---

## 6. KOMUT ÖZETLERİ (KULLANICI VE LLM İÇİN)

```bash
# Code update (after GitHub commit)
bash /root/sanctara-update.sh

# Backend logs (real-time)
journalctl -u sanctara-backend -f

# DB inspection
/root/sanctara/backend/.venv/bin/python3 /root/sanctara/backend/scripts/check_devices.py

# APK içerik kontrolü
unzip -l /root/sanctara/frontend/public/sanctara-node-pro.apk | head -20

# Endpoint testi (admin metrics)
TOKEN=$(curl -sX POST https://sanctara.io/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@thegrid.io","password":"Grid@Admin2026"}' | jq -r .token)
curl -s "https://sanctara.io/api/admin/mobile-mining/metrics" \
    -H "Authorization: Bearer $TOKEN" | jq

# Backend service control
systemctl restart sanctara-backend
systemctl status sanctara-backend
```

---

## 7. CHATGPT'YE NASIL SOR

> "Bu Sanctara sisteminde telefonun pool'a gerçek mining yapıyor (supportxmr.com'da 280 H/s görünüyor) ama admin panelde MOBILE COMPUTE her zaman 0 veya çok düşük (örn 2.6 H/s) gösteriyor. Heartbeat backend'e ulaşıyor (log'da 200 OK var). DB'de `last_heartbeat` STRING olarak saklanıyor. Bu handoff dokümanına bakarak şu üç şeyi yap:
> 
> 1. **`server.py`'deki `/devices/heartbeat` endpoint'inin** payload'dan gelen `local_hashrate_hps`, `native_pow`, `accepted_shares` değerlerini DB'ye doğru yazıp yazmadığını kontrol et. Eğer eksik field varsa düzelt.
> 2. **`/admin/mobile-mining/metrics` endpoint'inde** kullanılan filtrelerin (`native_pow: True`, `local_hashrate_hps > 0`) DB'deki güncel cihazlarla eşleşip eşleşmediğini test et. Belki Android tarafı `native_pow` field'ını farklı bir isimle gönderiyor olabilir.
> 3. **Android `GridWorkerService.java`'da heartbeat payload'unu** kontrol et — gerçekten `native_pow` ve `local_hashrate_hps` mi gönderiyor, yoksa `engine_running` veya `hashrate_hps` gibi farklı isimler mi?"

---

## 8. EK KAYNAKLAR

- Tüm kod GitHub'da: https://github.com/derdapc-crypto/kral
- Çalıştırılan workflow'lar: https://github.com/derdapc-crypto/kral/actions
- En son APK release: https://github.com/derdapc-crypto/kral/releases/latest

---

Hazırlayan: E1 (Emergent agent) — Şubat 2026
