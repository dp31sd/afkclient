#!/usr/bin/env node
// ============================================================
// SMP AFK Client v2 - Profesyonel sürüm
// Java / Crack (offline) | Çoklu bot + ortak sohbet + dosya logu
// + kick sınıflandırma + mesaj kuyruğu + health monitor
// ============================================================
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');
const http = require('http');

const SON_AYAR = './son-ayar.json';
const LOG_DIR = './logs';

// ---------- Logger (konsol + dosya) ----------
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
function gunlukDosya(ad) {
  const gun = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `${ad}-${gun}.log`);
}
function dosyayaYaz(dosya, satir) {
  try { fs.appendFileSync(dosya, satir + '\n'); } catch {}
}
function log(tag, msg) {
  const zaman = new Date().toLocaleString('tr-TR');
  const satir = `[${zaman}] [${tag}] ${msg}`;
  console.log(satir);
  dosyayaYaz(gunlukDosya('combined'), satir);
}
function chatLog(botIsmi, mesaj) {
  const zaman = new Date().toLocaleString('tr-TR');
  const temiz = String(mesaj).slice(0, 500); // log enjeksiyonuna karşı sınır
  dosyayaYaz(gunlukDosya('chat'), `[${zaman}] (${botIsmi}) ${temiz}`);
  gecmiseEkle(temiz, botIsmi);
  console.log(`\x1b[33m[SOHBET]\x1b[0m (\x1b[36m${botIsmi}\x1b[0m) ${temiz}`);
}
function auditLog(ip, hedef, mesaj, sonuc) {
  const zaman = new Date().toLocaleString('tr-TR');
  dosyayaYaz(gunlukDosya('audit'), `[${zaman}] IP=${ip} HEDEF=${hedef} SONUC=${sonuc} MESAJ=${String(mesaj).slice(0, 200)}`);
}

// ---------- Kick sınıflandırma ----------
// Profesyonel yaklaşım: her atılma aynı değildir. Ban'da sonsuz retry hesapları yakar.
function kickSinifla(sebep) {
  const s = String(sebep || '').toLowerCase();
  if (/ban|yasak|blacklist/.test(s)) return 'ban';
  if (/full|dolu|limit|kapasite|server is full/.test(s)) return 'full';
  if (/restart|bakım|bakim|maintenance|whitelist/.test(s)) return 'bakim';
  if (/already connected|duplicate|ayni|aynı isim|invalid session|authentication|oturum/.test(s)) return 'oturum';
  if (/fly|cheat|hile|hack|spam|bot/.test(s)) return 'guvenlik';
  return 'gecici';
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function sor(soru, varsayilan = '') {
  const ek = varsayilan ? ` [${varsayilan}]` : '';
  return new Promise((res) => rl.question(`${soru}${ek}: `, (c) => {
    c = c.trim();
    res(c === '' ? varsayilan : c);
  }));
}

let botlar = [];
const BASLANGIC = Date.now();

// ---------- Paylaşılan durum: web panel + olay takibi ----------
const chatGecmisi = [];   // son 100 sohbet {zaman, bot, mesaj}
const olayGecmisi = [];   // giriş/çıkış/lobby olayları {zaman, tur, detay}
let AYAR = { lobbyDonus: [], webPort: 3000, panelIzinliIP: [] }; // başlangıçta dolar
// IP normalize: ::ffff:1.2.3.4 -> 1.2.3.4
function ipTemizle(ip) {
  if (!ip) return '?';
  return String(ip).replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
}
function gecmiseEkle(mesaj, botIsmi) {
  chatGecmisi.push({ zaman: new Date().toLocaleString('tr-TR'), bot: botIsmi, mesaj });
  if (chatGecmisi.length > 100) chatGecmisi.shift();
}
function olayEkle(tur, detay) {
  const o = { zaman: new Date().toLocaleString('tr-TR'), tur, detay };
  olayGecmisi.push(o);
  if (olayGecmisi.length > 100) olayGecmisi.shift();
  log('OLAY', `[${tur}] ${detay}`);
}

// Oyuncu giriş/çıkış kalıpları (TR + EN, ChickenNW tarzı)
function oyuncuOlayi(mesaj) {
  if (!mesaj) return null;
  let m;
  // "X oyuna katıldı" / "X oyundan ayrıldı"
  m = mesaj.match(/^(.+?) oyuna katıldı/i) || mesaj.match(/^(.+?) joined/i);
  if (m) return { tur: 'GIRIS', oyuncu: m[1].trim() };
  m = mesaj.match(/^(.+?) oyundan ayrıldı/i) || mesaj.match(/^(.+?) (left|disconnected)/i);
  if (m) return { tur: 'CIKIS', oyuncu: m[1].trim() };
  return null;
}
// Lobby/hub'a düşme kalıpları
function lobbydeMi(mesaj) {
  if (!mesaj) return false;
  const s = mesaj.toLowerCase();
  return /lobi|hub|ana menü|ana menu|seni lobiye|smp'ye dön|smpye|bir sunucu seç|sağ tıkla|server selector|connect.*lobby|warp.*hub/.test(s);
}

// ---------- Discord alarmı (webhook, paketsiz) ----------
function discordGonder(icerik) {
  const url = AYAR.discordWebhook;
  if (!url || !url.startsWith('http')) return;
  try {
    const mod = url.startsWith('https') ? require('https') : require('http');
    const veri = JSON.stringify({ content: String(icerik).slice(0, 1500) });
    const u = new URL(url);
    const req = mod.request({
      hostname: u.hostname, port: u.port || (url.startsWith('https') ? 443 : 80),
      path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(veri) },
      timeout: 8000,
    });
    req.on('error', () => {});
    req.write(veri);
    req.end();
  } catch {}
}
function alarm(tur, detay) {
  olayEkle(tur, detay);
  if (['BAN', 'KRITIK', 'KOPMA', 'LOBBY', 'OTURUM'].includes(tur)) discordGonder(`[${tur}] ${detay}`);
}

// ---------- Bot ----------
function botBaslat({ host, port, version, isim, sifre, girisKomutlari, antiAfk }) {
  const info = {
    isim, bot: null, bagli: false,
    antiTimer: null, yenidenTimer: null, kuyrukTimer: null,
    deneme: 0, kapatiliyor: false,
    mesajKuyrugu: [], sonGiris: null, uptime: null,
  };
  botlar.push(info);

  // Mesaj kuyruğu: spam-kick yememek için 1.2 sn arayla gönder
  function kuyrugaEkle(mesaj) {
    info.mesajKuyrugu.push(mesaj);
  }
  function kuyruguBaslat() {
    if (info.kuyrukTimer) clearInterval(info.kuyrukTimer);
    info.kuyrukTimer = setInterval(() => {
      if (!info.bagli || !info.bot) return;
      const m = info.mesajKuyrugu.shift();
      if (m) { try { info.bot.chat(m); } catch {} }
    }, 1200);
  }

  function yenidenPlanla(sebep) {
    if (info.kapatiliyor) return;
    if (info.yenidenTimer) return;
    info.bagli = false;
    if (info.antiTimer) { clearInterval(info.antiTimer); info.antiTimer = null; }

    const tur = kickSinifla(sebep);
    info.deneme++;

    // Kritik sınıflar: sonsuz deneme YAPMA
    if ((tur === 'ban' || tur === 'guvenlik') && info.deneme >= 3) {
      log(isim, `KRITIK (${tur}): ${sebep}. 3 deneme doldu, oto-giris DURDURULDU. Ismi degistirip manuel baslat.`);
      alarm('BAN', `${isim} durduruldu (${tur}): ${sebep}`);
      return;
    }
    if (tur === 'oturum' && info.deneme >= 5) {
      log(isim, `OTURUM SORUNU: "${sebep}". Baska yerde bu isimle biri oyunda olabilir. 5 deneme doldu, durduruldu.`);
      alarm('OTURUM', `${isim} durduruldu: ${sebep}`);
      return;
    }

    let bekle = 5000; // varsayılan: 5 sn (isteğin)
    if (tur === 'full') bekle = 15000;   // sunucu doluysa 15 sn bekle
    if (tur === 'bakim') bekle = 30000;  // bakım/restart ise 30 sn bekle
    bekle += Math.floor(Math.random() * 1000); // jitter: aynı anda yığılmayı engeller

    log(isim, `${sebep} [${tur}] ${bekle / 1000} sn sonra tekrar (deneme #${info.deneme})`);
    if (info.deneme === 1 || tur === 'bakim') alarm('KOPMA', `${isim}: ${sebep} (deneme #${info.deneme})`);
    info.yenidenTimer = setTimeout(() => { info.yenidenTimer = null; baglan(); }, bekle);
  }

  function baglan() {
    if (info.kapatiliyor) return;
    info.sonGiris = new Date().toLocaleString('tr-TR');
    log(isim, `Baglaniyor -> ${host}:${port} ...`);
    const bot = mineflayer.createBot({
      host,
      port: parseInt(port, 10),
      username: isim,
      auth: 'offline',
      version: version || false,
      checkTimeoutInterval: 60 * 1000,
      viewDistance: 'tiny',   // düşük RAM: chunk işlemeyi minimuma indirir
      hideErrors: true,
    });
    info.bot = bot;
    kuyruguBaslat();

    bot.on('login', () => log(isim, 'Giris yapildi.'));
    bot.on('spawn', () => {
      info.bagli = true;
      info.deneme = 0;
      info.uptime = Date.now();
      log(isim, `Oyunda! Konum: ${bot.entity.position}`);

      if (sifre) {
        kuyrugaEkle(`/register ${sifre} ${sifre}`);
        setTimeout(() => kuyrugaEkle(`/login ${sifre}`), 2500);
      }
      let gecikme = sifre ? 7000 : 3000;
      for (const k of girisKomutlari) {
        const komut = k;
        setTimeout(() => {
          if (info.bagli) { log(isim, `Komut: ${komut}`); kuyrugaEkle(komut); }
        }, gecikme);
        gecikme += 3000;
      }

      if (antiAfk) {
        if (info.antiTimer) clearInterval(info.antiTimer);
        info.antiTimer = setInterval(() => {
          if (!info.bagli) return;
          try {
            // İnsan benzeri: rastgele bak + bazen zıpla + bazen sneak
            const yaw = Math.random() * Math.PI * 2;
            bot.look(yaw, (Math.random() - 0.5) * 0.3, true).catch(() => {});
            if (Math.random() < 0.6) {
              bot.setControlState('jump', true);
              setTimeout(() => { try { bot.setControlState('jump', false); } catch {} }, 500);
            }
            if (Math.random() < 0.3) {
              bot.setControlState('sneak', true);
              setTimeout(() => { try { bot.setControlState('sneak', false); } catch {} }, 1500);
            }
            bot.swingArm('right');
          } catch {}
        }, 25000 + Math.random() * 15000);
      }
    });

    bot.on('messagestr', (mesaj) => {
      if (!mesaj || !mesaj.trim()) return;
      chatLog(isim, mesaj);

      // 1) Oyuncu giriş/çıkış takibi
      const olay = oyuncuOlayi(mesaj.replace(/§./g, ''));
      if (olay) olayEkle(olay.tur, `${olay.oyuncu} (${isim} gördü)`);

      // 2) Akıllı lobby dönüşü: hub'a düşmüşsek dönüş komutlarını SIRAYLA gönder
      // Örn: /smp -> sunucu geçişi zaman alır -> /warp afk (8 sn arayla)
      if (AYAR.lobbyDonus.length && lobbydeMi(mesaj.replace(/§./g, ''))) {
        if (!info.lobbyTimer) {
          log(isim, `LOBBY algılandı, sıra başlıyor: ${AYAR.lobbyDonus.join(' -> ')}`);
          alarm('LOBBY', `${isim} lobide, dönüş sırası: ${AYAR.lobbyDonus.join(' -> ')}`);
          const sira = [...AYAR.lobbyDonus];
          const gonderSiradaki = () => {
            if (!info.bagli || info.kapatiliyor) { info.lobbyTimer = null; return; }
            const k = sira.shift();
            if (!k) { info.lobbyTimer = null; log(isim, 'Lobby dönüş sırası tamamlandı.'); return; }
            log(isim, `Lobby dönüş komutu: ${k}`);
            kuyrugaEkle(k);
            info.lobbyTimer = setTimeout(gonderSiradaki, 8000); // sunucu geçişi için 8 sn bekle
          };
          info.lobbyTimer = setTimeout(gonderSiradaki, 5000);
        }
      }
    });
    bot.on('whisper', (gonderen, mesaj) => {
      const satir = `[FISILTI] (${isim}) ${gonderen} -> ${mesaj}`;
      log('FISILTI', satir);
    });
    bot.on('kicked', (sebep) => yenidenPlanla(`KICK: ${sebep}.`));
    bot.on('end', (sebep) => yenidenPlanla(`Baglanti koptu${sebep ? ': ' + sebep : ''}.`));
    bot.on('error', (e) => log(isim, `Hata: ${e.message}`));
  }
  baglan();
}

// ---------- Health monitor (60 sn'de bir özet + status.json) ----------
setInterval(() => {
  const bagli = botlar.filter((b) => b.bagli).length;
  const ozet = botlar.map((b) => `${b.isim}:${b.bagli ? 'OK' : 'KOPUK#' + b.deneme}`).join(' ');
  log('SISTEM', `Health: ${bagli}/${botlar.length} bagli | ${ozet} | uptime: ${Math.floor((Date.now() - BASLANGIC) / 60000)} dk`);
  try {
    fs.writeFileSync('./status.json', JSON.stringify({
      zaman: new Date().toISOString(),
      toplam: botlar.length, bagli,
      botlar: botlar.map((b) => ({ isim: b.isim, bagli: b.bagli, deneme: b.deneme, sonGiris: b.sonGiris })),
    }, null, 2));
  } catch {}
}, 60000);

// ---------- Graceful shutdown ----------
function kapat() {
  log('SISTEM', 'Kapatma sinyali alindi, botlar guvenli kapatiliyor...');
  for (const b of botlar) {
    b.kapatiliyor = true;
    if (b.yenidenTimer) clearTimeout(b.yenidenTimer);
    if (b.antiTimer) clearInterval(b.antiTimer);
    if (b.kuyrukTimer) clearInterval(b.kuyrukTimer);
    try { b.bot && b.bot.quit(); } catch {}
  }
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', kapat);
process.on('SIGTERM', kapat);

// ---------- Web panel (durum + son sohbet + tek tık komut + şifre + IP kilidi + kick) ----------
function webPanelBaslat(port, panelSifre) {
  const sonKomut = new Map(); // IP -> zaman (1 sn hız limiti)
  const hatali = new Map();   // IP -> [zamanlar] (brute-force takibi)
  const bloklu = new Map();   // IP -> blokBitisZamani
  function yetkiliMi(req) {
    if (!panelSifre) return true; // şifre yoksa açık (ilk kurulum kolaylığı)
    const auth = req.headers.authorization || '';
    // Basic Auth bekleniyor: Authorization: Basic base64(kullanici:sifre)
    if (!auth.startsWith('Basic ')) return false;
    try {
      const cozulmus = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      const sifre = cozulmus.split(':').slice(1).join(':');
      return sifre === panelSifre;
    } catch { return false; }
  }
  function kayitHata(ip) {
    const simdi = Date.now();
    const liste = (hatali.get(ip) || []).filter((t) => simdi - t < 10 * 60 * 1000);
    liste.push(simdi);
    hatali.set(ip, liste);
    // 10 dk içinde 5 hatalı deneme -> 30 dk blokla (kick)
    if (liste.length >= 5) {
      bloklu.set(ip, simdi + 30 * 60 * 1000);
      hatali.delete(ip);
      auditLog(ip, '-', '-', 'BLOKLANDI-30dk');
      log('WEB-GUVENLIK', `BLOK: ${ip} 5 hatali deneme -> 30 dk kicklendi.`);
      discordGonder(`🚫 Panel saldırı engellendi: ${ip} 30 dk bloklandı.`);
    }
  }
  const server = http.createServer((req, res) => {
    const ipHam = req.socket.remoteAddress || '?';
    const ip = ipTemizle(ipHam);
    const yol = req.url.split('?')[0];
    // 1) Bloklu mu? (kick - içeri sokma)
    if (bloklu.has(ip) && Date.now() < bloklu.get(ip)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bloklandin.');
      return;
    } else if (bloklu.has(ip)) bloklu.delete(ip);
    // 2) IP whitelist: liste doluysa sadece listedekiler girebilir
    const izinli = AYAR.panelIzinliIP || [];
    if (izinli.length && !izinli.includes(ip)) {
      auditLog(ip, '-', yol, 'IP-REDDEDILDI');
      kayitHata(ip);
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bu panele giris iznin yok.');
      return;
    }
    if (!yetkiliMi(req)) {
      auditLog(ip, '-', yol, 'SIFRE-HATALI');
      kayitHata(ip);
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="AFK Panel"', 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Şifre gerekli');
      return;
    }
    if (yol === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        zaman: new Date().toISOString(),
        toplam: botlar.length,
        bagli: botlar.filter((b) => b.bagli).length,
        botlar: botlar.map((b) => ({ isim: b.isim, bagli: b.bagli, deneme: b.deneme, sonGiris: b.sonGiris })),
        olaylar: olayGecmisi.slice(-20).reverse(),
      }));
      return;
    }
    if (yol === '/api/chat') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(chatGecmisi.slice(-50).reverse()));
      return;
    }
    if (yol === '/api/cmd' && req.method === 'POST') {
      const simdi = Date.now();
      if (simdi - (sonKomut.get(ip) || 0) < 1000) {
        auditLog(ip, '-', '-', 'HIZ-LIMITI');
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end('{"ok":false,"hata":"1 sn bekle"}');
        return;
      }
      sonKomut.set(ip, simdi);
      let govde = '';
      req.on('data', (p) => { govde += p; if (govde.length > 2000) req.destroy(); });
      req.on('end', () => {
        try {
          const { hedef, mesaj } = JSON.parse(govde || '{}');
          const temiz = String(mesaj || '').slice(0, 200).trim();
          if (!temiz) throw new Error('mesaj boş');
          if (!/^[\wçğıöşüÇĞİÖŞÜ .,!?:;/\-+@#]+$/.test(temiz)) throw new Error('geçersiz karakter');
          if (hedef && hedef !== 'TUMU') {
            const b = botlar.find((x) => x.isim === hedef);
            if (b && b.bagli) b.mesajKuyrugu.push(temiz);
            else throw new Error('bot bağlı değil');
          } else {
            for (const b of botlar) if (b.bagli) b.mesajKuyrugu.push(temiz);
          }
          auditLog(ip, hedef || 'TUMU', temiz, 'OK');
          log('WEB', `Panel komutu (${hedef || 'TUMU'}): ${temiz}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        } catch (e) {
          auditLog(ip, '-', String(govde).slice(0, 100), 'HATA:' + e.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, hata: e.message }));
        }
      });
      return;
    }
    // Ana sayfa - modern panel
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AFK Panel</title><style>
*{box-sizing:border-box}
:root{--yesil:#22c55e;--mavi:#38bdf8;--mor:#a78bfa;--turuncu:#fb923c;--kirmizi:#f87171;--kart:rgba(255,255,255,.05);--cizgi:rgba(255,255,255,.1)}
body{font-family:'Segoe UI',system-ui;background:#0b0f14;color:#e8eef4;margin:0;min-height:100vh;overflow-x:hidden}
.bg{position:fixed;inset:0;z-index:-1;overflow:hidden}
.bg span{position:absolute;border-radius:50%;filter:blur(90px);opacity:.25;animation:suzul 14s ease-in-out infinite alternate}
.bg span:nth-child(1){width:420px;height:420px;background:#22c55e;top:-120px;left:-100px}
.bg span:nth-child(2){width:360px;height:360px;background:#0ea5e9;top:10%;right:-120px;animation-delay:-5s}
.bg span:nth-child(3){width:300px;height:300px;background:#a78bfa;bottom:-100px;left:40%;animation-delay:-9s}
@keyframes suzul{to{transform:translate(60px,40px) scale(1.15)}}
header{position:sticky;top:0;z-index:5;backdrop-filter:blur(12px);background:rgba(11,15,20,.8);padding:12px 18px;display:flex;align-items:center;gap:12px;animation:asagi .5s ease}
header::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,var(--yesil),var(--mavi),var(--mor),var(--yesil));background-size:300% 100%;animation:akis 6s linear infinite}
@keyframes akis{to{background-position:300% 0}}
@keyframes asagi{from{transform:translateY(-100%);opacity:0}to{transform:none;opacity:1}}
.logo{font-size:24px;display:inline-block;animation:sallan 3s ease-in-out infinite}
@keyframes sallan{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(12deg) scale(1.1)}}
.ozet{margin-left:auto;display:flex;gap:8px;align-items:center;font-size:14px;background:#ffffff0d;padding:6px 12px;border-radius:20px;border:1px solid var(--cizgi)}
.canli{width:10px;height:10px;border-radius:50%;background:var(--yesil);box-shadow:0 0 0 0 #22c55e88;animation:nabiz 1.6s infinite}
@keyframes nabiz{70%{box-shadow:0 0 0 10px transparent}100%{box-shadow:0 0 0 0 transparent}}
.govde{max-width:1000px;margin:0 auto;padding:18px;display:grid;gap:14px;grid-template-columns:1fr 1fr}
@media(max-width:760px){.govde{grid-template-columns:1fr}}
.kart{background:var(--kart);border:1px solid var(--cizgi);border-radius:16px;padding:16px;animation:yukari .45s ease;transition:transform .2s,box-shadow .2s,border-color .2s}
.kart:hover{transform:translateY(-2px);box-shadow:0 12px 30px #0008;border-color:#22c55e55}
@keyframes yukari{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}
.kart h3{margin:0 0 10px;font-size:15px;letter-spacing:.3px;opacity:.9}
.tam{grid-column:1/-1}
.sekmeler{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.sekme{padding:7px 13px;border-radius:20px;background:#ffffff0d;border:1px solid var(--cizgi);font-size:13px;cursor:pointer;transition:all .25s;position:relative;overflow:hidden}
.sekme:hover{background:#ffffff18;transform:translateY(-1px)}
.sekme.aktif{background:linear-gradient(135deg,#22c55e,#0ea5e9);color:#04120a;font-weight:700;border-color:transparent;box-shadow:0 4px 14px #22c55e55;animation:pop .3s ease}
@keyframes pop{0%{transform:scale(.85)}60%{transform:scale(1.08)}100%{transform:scale(1)}}
.sekme .sayi{font-size:11px;opacity:.75;margin-left:4px}
#chat{background:#0009;border:1px solid var(--cizgi);border-radius:12px;padding:10px;height:320px;overflow-y:auto;font-size:14px;scroll-behavior:smooth}
#chat div{padding:4px 8px;border-radius:8px;animation:satir .35s ease}
#chat div:nth-child(odd){background:#ffffff08}
@keyframes satir{from{opacity:0;transform:translateX(-12px) scale(.98)}to{opacity:1;transform:none}}
.bot{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:12px;background:#ffffff07;margin-bottom:8px;transition:all .25s;animation:yukari .4s ease}
.bot:hover{background:#ffffff10;transform:translateX(4px)}
.bot .mini{margin-left:auto;display:flex;gap:6px}
.bot .mini button{font-size:11px;padding:6px 9px}
.avatar{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:800;color:#04120a;flex-shrink:0;animation:pop .4s ease}
.nokta{width:11px;height:11px;border-radius:50%;flex-shrink:0}
.nokta.on{background:var(--yesil);box-shadow:0 0 8px var(--yesil);animation:nabiz 1.6s infinite}
.nokta.off{background:var(--kirmizi);box-shadow:0 0 8px var(--kirmizi);animation:son 1s ease infinite alternate}
@keyframes son{to{opacity:.4}}
.olay{font-size:13px;padding:6px 8px;border-left:3px solid var(--mavi);background:#38bdf812;border-radius:0 8px 8px 0;margin-bottom:6px;animation:satir .3s ease}
.olay b{color:var(--mavi)}
input,select{padding:10px;border-radius:10px;border:1px solid var(--cizgi);background:#000a;color:#eee;width:100%;margin-bottom:8px;outline:none;transition:border .2s,box-shadow .2s}
input:focus,select:focus{border-color:var(--yesil);box-shadow:0 0 0 3px #22c55e33}
.satir{display:flex;gap:8px;flex-wrap:wrap}
button{padding:10px 14px;border-radius:10px;border:none;background:linear-gradient(135deg,#22c55e,#16a34a);color:#04120a;font-weight:700;cursor:pointer;transition:transform .15s,filter .15s,box-shadow .2s;position:relative;overflow:hidden}
button:hover{filter:brightness(1.12);box-shadow:0 6px 18px #22c55e44}button:active{transform:scale(.95)}
button.ghost{background:#ffffff14;color:#eee}
button.ghost:hover{background:#22c55e33}
#toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(80px);background:#111ee;border:1px solid var(--yesil);padding:10px 18px;border-radius:30px;opacity:0;transition:all .35s cubic-bezier(.2,1.4,.4,1);z-index:9}
#toast.goster{transform:translateX(-50%);opacity:1}
.ara{margin-bottom:8px}
.hizli{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.hizli button{font-size:12px;padding:7px 10px;animation:yukari .4s ease}
.yukleniyor{background:linear-gradient(90deg,#ffffff08 25%,#ffffff18 50%,#ffffff08 75%);background-size:200% 100%;animation:parla 1.2s infinite;border-radius:8px;height:20px;margin-bottom:6px}
@keyframes parla{to{background-position:-200% 0}}
.kategori{font-size:12px;opacity:.55;margin:10px 0 6px;text-transform:uppercase;letter-spacing:1px}
</style></head><body>
<div class="bg"><span></span><span></span><span></span></div>
<header><div class="logo">⛏️</div><div><b>AFK Panel</b><div style="font-size:12px;opacity:.6">SMP Kontrol Merkezi</div></div><div class="ozet"><span class="canli"></span><span id="ozet">yükleniyor…</span></div></header>
<div class="govde">
<div class="kart"><h3>📤 Komut Merkezi</h3>
<select id="hedef"><option value="TUMU">TÜM botlar</option></select>
<input id="mesaj" placeholder="/afk veya selam…" onkeydown="if(event.key==='Enter')gonder()">
<div class="satir"><button onclick="gonder()">Gönder ➤</button></div>
<div class="kategori">⚡ Hızlı komutlar</div>
<div class="hizli"><button class="ghost" onclick="komut('/afk')">😴 /afk</button><button class="ghost" onclick="komut('/smp')">🌍 /smp</button><button class="ghost" onclick="komut('/warp afk')">📍 /warp afk</button><button class="ghost" onclick="komut('/spawn')">🏠 /spawn</button><button class="ghost" onclick="komut('/home')">🛏️ /home</button><button class="ghost" onclick="komut('/msg')">💌 /msg</button></div>
</div>
<div class="kart"><h3>🤖 Botlar <small id="botsayi" style="opacity:.5"></small></h3><div id="botlar"><div class="yukleniyor"></div><div class="yukleniyor"></div></div></div>
<div class="kart tam"><h3>💬 Sohbet <small style="opacity:.5">hesap sekmesiyle filtrele</small></h3><div class="sekmeler" id="sekmeler"></div><input id="ara" class="ara" placeholder="🔍 sohbette ara…" oninput="ciz(false)"><div id="chat"><div class="yukleniyor"></div><div class="yukleniyor"></div><div class="yukleniyor"></div></div></div>
<div class="kart tam"><h3>📋 Olaylar <small style="opacity:.5">giriş / çıkış / lobby / blok</small></h3><div id="olaylar"></div></div>
</div>
<div id="toast"></div>
<script>
let cache=[],botlar=[],sekme='TUMU';
const RENKLER=['#22c55e','#38bdf8','#a78bfa','#fb923c','#f472b6','#facc15','#2dd4bf','#f87171'];
function renk(isim){let h=0;for(const c of isim)h=(h*31+c.charCodeAt(0))>>>0;return RENKLER[h%RENKLER.length];}
function kisa(isim){return isim.replace(/^AFK_?/i,'').slice(0,2).toUpperCase()||'•';}
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('goster');clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove('goster'),2200);}
function sekmeSec(s){sekme=s;ciz(false);}
function hedefSec(isim){const h=document.getElementById('hedef');h.value=isim;document.getElementById('mesaj').focus();toast('🎯 Hedef: '+isim);}
function cizSkm(){
  const say={};cache.forEach(m=>say[m.bot]=(say[m.bot]||0)+1);
  let h='<div class="sekme '+(sekme==='TUMU'?'aktif':'')+'" onclick="sekmeSec(\\'TUMU\\')">📢 TÜMÜ<span class="sayi">'+cache.length+'</span></div>';
  h+=botlar.map(b=>'<div class="sekme '+(sekme===b.isim?'aktif':'')+'" onclick="sekmeSec(\\''+b.isim+'\\')" style="'+(sekme===b.isim?'':'border-color:'+renk(b.isim)+'66')+'">'+(b.bagli?'🟢':'🔴')+' '+b.isim+'<span class="sayi">'+(say[b.isim]||0)+'</span></div>').join('');
  document.getElementById('sekmeler').innerHTML=h;
}
function ciz(aga=true){
  cizSkm();
  const f=(document.getElementById('ara').value||'').toLowerCase();
  const liste=cache.filter(m=>(sekme==='TUMU'||m.bot===sekme)&&(!f||m.mesaj.toLowerCase().includes(f)||m.bot.toLowerCase().includes(f)));
  const ch=document.getElementById('chat');
  const dipte=ch.scrollHeight-ch.scrollTop-ch.clientHeight<60;
  ch.innerHTML=liste.map(m=>'<div><small style="opacity:.5">'+m.zaman+'</small> <b style="color:'+renk(m.bot)+'">('+m.bot+')</b> '+m.mesaj.replace(/</g,'&lt;')+'</div>').join('')||'<small>bu sekmede mesaj yok</small>';
  if(dipte)ch.scrollTop=ch.scrollHeight;
}
async function yenile(){
  try{
  const s=await (await fetch('/api/status')).json();
  botlar=s.botlar||[];
  document.getElementById('ozet').textContent=s.bagli+'/'+s.toplam+' bağlı';
  document.getElementById('botsayi').textContent='(' + s.bagli + '/' + s.toplam + ')';
  document.getElementById('botlar').innerHTML=botlar.map(b=>'<div class=bot><div class=avatar style="background:'+renk(b.isim)+'">'+kisa(b.isim)+'</div><span class="nokta '+(b.bagli?'on':'off')+'"></span><div><b>'+b.isim+'</b><div style="font-size:12px;opacity:.6">'+(b.bagli?'🟢 BAĞLI':('🔴 KOPUK #'+b.deneme+' • '+(b.sonGiris||'')))+'</div></div><div class=mini><button class=ghost onclick="hedefSec(\\''+b.isim+'\\')">🎯</button></div></div>').join('')||'bot yok';
  const h=document.getElementById('hedef');const cur=h.value;
  h.innerHTML='<option value=TUMU>📢 TÜM botlar</option>'+botlar.map(b=>'<option>'+b.isim+'</option>').join('');
  h.value=[...h.options].some(o=>o.value===cur)?cur:'TUMU';
  document.getElementById('olaylar').innerHTML=(s.olaylar||[]).map(o=>'<div class=olay><small>'+o.zaman+'</small> <b>'+o.tur+'</b> '+o.detay.replace(/</g,'&lt;')+'</div>').join('')||'<small>henüz olay yok</small>';
  const c=await (await fetch('/api/chat')).json();cache=c;ciz(false);
  }catch(e){}
}
async function gonder(){const h=document.getElementById('hedef').value;const m=document.getElementById('mesaj').value.trim();if(!m)return;const r=await fetch('/api/cmd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hedef:h,mesaj:m})});if(r.ok){toast('✅ Gönderildi → '+h);document.getElementById('mesaj').value='';}else{const j=await r.json().catch(()=>({hata:r.status}));toast('⛔ '+(j.hata||'hata'));}}
function komut(k){document.getElementById('mesaj').value=k;gonder();}
setInterval(yenile,2500);yenile();
</script></body></html>`);
  });
  server.listen(port, '0.0.0.0', () => log('WEB', `Panel açık: http://SUNUCU-IP:${port} (telefondan da girilir)`));
  server.on('error', (e) => log('WEB', `Panel açılamadı (${port}): ${e.message}`));
}

// ---------- Komut satırı ----------
function komutSatiri() {
  console.log('\n--- KOMUTLAR ---');
  console.log('  Duz yazi        -> TUM botlar (kuyruklu, 1.2 sn arayla)');
  console.log('  @Isim mesaj     -> Tek bot');
  console.log('  :komut /afk     -> TUM botlara komut');
  console.log('  :durum          -> Detayli durum + uptime');
  console.log('  :liste          -> Kisa liste');
  console.log('  :cikis          -> Guvenli kapat');
  console.log('  Loglar: ./logs/combined-GUN.log + ./logs/chat-GUN.log | Durum: ./status.json');
  console.log('------------------------------------------------\n');
  rl.setPrompt('\x1b[32m>\x1b[0m ');
  rl.prompt();
  rl.on('line', (satir) => {
    satir = satir.trim();
    if (!satir) { rl.prompt(); return; }
    if (satir === ':cikis' || satir === ':quit' || satir === ':q') { kapat(); return; }
    if (satir === ':liste') {
      for (const b of botlar) console.log(` - ${b.isim}: ${b.bagli ? 'BAGLI' : 'KOPUK (deneme ' + b.deneme + ')'}`);
      rl.prompt(); return;
    }
    if (satir === ':durum') {
      console.log(`Uptime: ${Math.floor((Date.now() - BASLANGIC) / 60000)} dk | Toplam: ${botlar.length}`);
      for (const b of botlar) {
        const up = b.uptime ? Math.floor((Date.now() - b.uptime) / 60000) + ' dk oyunda' : '-';
        console.log(` - ${b.isim}: ${b.bagli ? 'BAGLI (' + up + ')' : 'KOPUK'} | deneme:${b.deneme} | son giris:${b.sonGiris || '-'}`);
      }
      rl.prompt(); return;
    }
    if (satir === ':test-discord') {
      if (!AYAR.discordWebhook) console.log('Discord webhook ayarlı değil (son-ayar.json).');
      else { discordGonder('🔔 AFK client test bildirimi: webhook çalışıyor.'); console.log('Test bildirimi gönderildi, Discord kanalını kontrol et.'); }
      rl.prompt(); return;
    }
    if (satir.startsWith(':komut ')) {
      const k = satir.slice(7).trim();
      for (const b of botlar) if (b.bagli) b.mesajKuyrugu.push(k);
      log('SEN', `Kuyruga eklendi (tum botlar): ${k}`);
      rl.prompt(); return;
    }
    if (satir.startsWith('@')) {
      const bos = satir.indexOf(' ');
      if (bos > 1) {
        const hedef = satir.slice(1, bos);
        const msg = satir.slice(bos + 1);
        const b = botlar.find((x) => x.isim.toLowerCase() === hedef.toLowerCase());
        if (b && b.bagli) { b.mesajKuyrugu.push(msg); log('SEN', `Kuyruga (${b.isim}): ${msg}`); }
        else console.log(`Bot bulunamadi / bagli degil: ${hedef}`);
        rl.prompt(); return;
      }
    }
    for (const b of botlar) if (b.bagli) b.mesajKuyrugu.push(satir);
    log('SEN', `Kuyruga (tum botlar): ${satir}`);
    rl.prompt();
  });
}

(async () => {
  console.log('==============================================');
  console.log('   SMP AFK CLIENT v2 - Profesyonel');
  console.log('   Ortak sohbet + log + kick siniflama + kuyruk');
  console.log('==============================================\n');

  let kayitli = null;
  if (fs.existsSync(SON_AYAR)) { try { kayitli = JSON.parse(fs.readFileSync(SON_AYAR, 'utf8')); } catch {} }
  const hizli = process.argv.includes('--tekrar') && kayitli;
  let host, port, version, isimler = [], sifre = '', girisKomutlari = [], antiAfk = true;
  let lobbyDonus = [], webPort = 3000, panelSifre = '', discordWebhook = '', panelIzinliIP = [];

  if (hizli) {
    ({ host, port, version, sifre, girisKomutlari, antiAfk } = kayitli);
    isimler = kayitli.isimler;
    lobbyDonus = kayitli.lobbyDonus || [];
    webPort = kayitli.webPort || 3000;
    panelSifre = kayitli.panelSifre || '';
    discordWebhook = kayitli.discordWebhook || '';
    panelIzinliIP = kayitli.panelIzinliIP || [];
    console.log('son-ayar.json ile hizli baslatma.\n');
  } else {
    host = await sor('Sunucu IP', (kayitli && kayitli.host) || 'oyna.chickennw.com');
    port = await sor('Port', (kayitli && kayitli.port) || '25565');
    version = await sor('Surum (bos=otomatik, orn: 1.20.4)', (kayitli && kayitli.version) || '');
    const adetStr = await sor('Kac AFK hesap', '2');
    const adet = Math.max(1, Math.min(20, parseInt(adetStr, 10) || 2));
    console.log(`\n${adet} hesap ismi (bos = oto):`);
    for (let i = 1; i <= adet; i++) {
      const ad = await sor(`  ${i}. hesap`, '');
      isimler.push(ad || `AFK_${Math.floor(1000 + Math.random() * 9000)}`);
    }
    sifre = await sor('Kayit sifresi (yoksa bos)', (kayitli && kayitli.sifre) || '');
    const komutStr = await sor('Giris komutlari (virgulle, orn: /afk)', (kayitli && (kayitli.girisKomutlari || []).join(', ')) || '');
    girisKomutlari = komutStr.split(',').map((s) => s.trim()).filter(Boolean);
    const lobbyStr = await sor('Lobby donus komutlari (sirali, orn: /smp, /warp afk - yoksa bos)', (kayitli && (kayitli.lobbyDonus || []).join(', ')) || '/smp, /warp afk');
    lobbyDonus = lobbyStr.split(',').map((s) => s.trim()).filter(Boolean);
    const webStr = await sor('Web panel portu (0=kapali)', String((kayitli && kayitli.webPort) || 3000));
    webPort = parseInt(webStr, 10) || 0;
    panelSifre = webPort ? await sor('Web panel sifresi (bos=herkese acik, onerilmez)', (kayitli && kayitli.panelSifre) || '') : '';
    let ipStr = '';
    if (webPort) {
      console.log('IP kilidi: sadece senin IP girsin, baskasi denerse kick yer. IPni ogren: https://ifconfig.me');
      ipStr = await sor('Izinli IPler (virgulle, bos=herkes girebilir)', (kayitli && (kayitli.panelIzinliIP || []).join(', ')) || '');
    }
    panelIzinliIP = ipStr.split(',').map((s) => s.trim()).filter(Boolean);
    discordWebhook = await sor('Discord webhook (bos=kapali)', (kayitli && kayitli.discordWebhook) || '');
    const afkCevap = await sor('Anti-AFK (E/h)', 'E');
    antiAfk = !afkCevap.toLowerCase().startsWith('h');
    fs.writeFileSync(SON_AYAR, JSON.stringify({ host, port, version, isimler, sifre, girisKomutlari, lobbyDonus, webPort, panelSifre, panelIzinliIP, discordWebhook, antiAfk }, null, 2));
    try { fs.chmodSync(SON_AYAR, 0o600); } catch {} // sifreler düz metin durmasın diye dosya izni sıkılaştır
    console.log('\nKaydedildi: son-ayar.json (izin: sadece sen)\n');
  }
  AYAR = { lobbyDonus, webPort, panelSifre, discordWebhook, panelIzinliIP };

  log('SISTEM', `${isimler.length} bot baslatiliyor: ${isimler.join(', ')} -> ${host}:${port}`);
  if (discordWebhook) discordGonder(`✅ AFK client başladı: ${isimler.length} bot -> ${host}:${port}`);
  if (webPort) webPanelBaslat(webPort, panelSifre);
  isimler.forEach((isim, i) => {
    setTimeout(() => botBaslat({ host, port, version, isim, sifre, girisKomutlari, antiAfk }), i * (3000 + Math.random() * 2000));
  });
  komutSatiri();
})();
