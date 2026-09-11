#!/bin/bash
# Ubuntu VDS profesyonel baslatici
cd "$(dirname "$0")"
mkdir -p logs

if ! command -v node &> /dev/null; then
  echo "[KURULUM] Node.js kuruluyor..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
[ -d "node_modules" ] || npm install --no-audit --no-fund

echo "=== systemd ile 7/24 calistirma (onerilen) ==="
echo "  sudo cp afk.service /etc/systemd/system/afk.service"
echo "  sudo nano /etc/systemd/system/afk.service  # yol/kullanici duzenle"
echo "  sudo systemctl daemon-reload && sudo systemctl enable --now afk"
echo "  sudo journalctl -u afk -f   # canli log"
echo "=== gecici calistirma ==="
echo "  screen -S afk ./start.sh --tekrar"
echo ""

if [ "$1" == "--tekrar" ]; then
  node --max-old-space-size=256 --optimize-for-size afk.js --tekrar
else
  node --max-old-space-size=256 --optimize-for-size afk.js
fi
