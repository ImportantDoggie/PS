const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'public', 'assets');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

const games = [
  { id: 'prank', appId: 3001730 },
  { id: 'hole', appId: 3037930 },
  { id: '35mm', appId: 466500 },
  { id: 'plague', appId: 752590 },
  { id: 'afterfall', appId: 224420 },
  { id: 'alanwake', appId: 108710 },
  { id: 'american-nightmare', appId: 202750 },
  { id: 'alien', appId: 214490 },
  { id: 'amnesia', appId: 1944430 },
  { id: 'requiem', appId: 1182900 },
  { id: 'control', appId: 870780 },
  { id: 'hellblade', appId: 414340 },
  { id: 'metro', appId: 412020 },
  { id: 'death', appId: 1190460 },
  { id: 're2', appId: 883710 }
];

async function download(url, dest) {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buffer));
    console.log(`✅ Скачано: ${path.basename(dest)}`);
    return true;
  } catch (e) {
    console.log(`❌ Ошибка: ${path.basename(dest)}`);
    return false;
  }
}

async function run() {
  console.log('Начинаю скачивание обложек...');
  for (const g of games) {
    await download(`https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appId}/library_600x900_2x.jpg`, path.join(assetsDir, `${g.id}-cover.jpg`));
    await download(`https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appId}/library_hero.jpg`, path.join(assetsDir, `${g.id}-hero.jpg`));
    await download(`https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appId}/logo.png`, path.join(assetsDir, `${g.id}-logo.png`));
  }
  
  await download(`https://cdn.cloudflare.steamstatic.com/steam/apps/752590/library_hero.jpg`, path.join(assetsDir, `plague-bg.jpg`));
  await download(`https://cdn.cloudflare.steamstatic.com/steam/apps/752590/logo.png`, path.join(assetsDir, `plague-logo-white.png`));
  await download(`https://cdn.cloudflare.steamstatic.com/steam/apps/224420/library_600x900_2x.jpg`, path.join(assetsDir, `afterfall-sg-8734c5.png`));
  await download(`https://cdn.cloudflare.steamstatic.com/steam/apps/224420/library_hero.jpg`, path.join(assetsDir, `afterfall-hero-sg.png`));

  console.log('Готово! Все картинки в public/assets.');
}
run();