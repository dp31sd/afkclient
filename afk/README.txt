SMP AFK CLIENT - KULLANIM (TR)
================================

1) WINDOWS (kendi PC):
   - Node.js LTS kur: https://nodejs.org
   - start.bat dosyasına çift tıkla
   - Sorulara cevap ver:
     Sunucu IP : oyna.chickennw.com
     Port      : 25565
     Sürüm     : boş bırak (otomatik)
     Kaç hesap : örn 3
     İsimler   : tek tek yaz, boş bırakırsan oto üretilir
     Şifre     : sunucu /register istiyorsa yaz, yoksa boş
     Komutlar  : örn /afk  (birden fazlaysa virgülle: /smp, /afk)
     Anti-AFK  : E

2) UBUNTU VDS (cmd/ssh ile yönetim):
   Dosyaları VDS'ye at, sonra:
     chmod +x start.sh
     ./start.sh
   İlk çalışta soruları cevapla, ayarlar son-ayar.json'a kaydedilir.
   Sonraki açılışlarda sormadan başlatmak için:
     ./start.sh --tekrar

   Arka planda sürekli çalıştırma (SSH kapansa bile):
     sudo apt install -y screen
     screen -S afk
     ./start.sh --tekrar
     (ayrılmak için: CTRL+A sonra D)
     (geri dönmek için: screen -r afk)

3) ORTAK SOHBET + KOMUTLAR (çalışırken terminale yaz):
   - Düz yazı yaz -> TÜM botlar aynı mesajı sohbete atar
     Örn: selam millet
   - @İsim mesaj -> Sadece o bot yazar
     Örn: @AFK_1234 selam
   - :komut /afk -> TÜM botlar komut çalıştırır
   - :liste -> hangi bot bağlı gösterir
   - :cikis -> kapatır

   Tüm botların gördüğü sohbet terminalde şöyle görünür:
     [SOHBET] (AFK_1234) <Oyuncu> merhaba
     [SOHBET] (AFK_5678) <Oyuncu> merhaba

NOTLAR:
- Bu sistem crack/offline (ismini yaz-gir) sunucular içindir.
  Premium (Microsoft) sunucularda çalışmaz.
- Botlar 3'er saniye arayla girer, kick yerse 5-10 sn sonra oto-döner.
- Anti-AFK: 20-35 sn'de bir döner + zıplar, sunucunun AFK kickini engeller.
- ChickenNW gibi lobby'li sunucularda "giriş komutları"na örn:
  /smp, /afk  (sunucunun menüsüne göre değiştir)
