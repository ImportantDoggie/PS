'use strict';
// Windows-first game discovery. On non-Windows desktop builds it falls back to
// manual folders / shortcuts so the app still runs. Web preview uses demo scan.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const pexec = promisify(execFile);
const { base } = require('./seed');

const isWin = process.platform === 'win32';
const steamCover = id => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900_2x.jpg`;
const steamHero = id => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_hero.jpg`;
const steamLogo = id => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/logo.png`;

function readJsonSafe(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function exists(p) { try { return !!p && fs.existsSync(p); } catch { return false; } }
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'game'; }

async function regQuery(key, value) {
  if (!isWin) return null;
  try {
    const args = ['query', key];
    if (value) args.push('/v', value);
    const { stdout } = await pexec('reg', args, { windowsHide: true, timeout: 8000 });
    if (value) {
      const m = stdout.match(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+REG_[A-Z_]+\\s+(.+)'));
      return m ? m[1].trim() : null;
    }
    return stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('HKEY_'));
  } catch { return null; }
}

function parseVdf(text) {
  // Minimal Valve KeyValue parser sufficient for libraryfolders / appmanifest.
  const root = {}; const stack = [root]; let i = 0;
  const token = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] === '{' || text[i] === '}') return text[i++];
    if (text[i] === '"') { i++; let s = ''; while (i < text.length && text[i] !== '"') { if (text[i] === '\\' && i + 1 < text.length) i++; s += text[i++]; } i++; return s; }
    let s = ''; while (i < text.length && !/\s|{|}/.test(text[i])) s += text[i++]; return s;
  };
  let pendingKey = null;
  while (i < text.length) {
    const t = token(); if (t === undefined || t === '') break;
    if (t === '{') { const obj = {}; if (pendingKey !== null) { stack[stack.length - 1][pendingKey] = obj; pendingKey = null; } stack.push(obj); }
    else if (t === '}') stack.pop();
    else if (pendingKey === null) pendingKey = t;
    else { stack[stack.length - 1][pendingKey] = t; pendingKey = null; }
  }
  return root;
}

async function findSteam() {
  const candidates = [];
  const reg = await regQuery('HKCU\\Software\\Valve\\Steam', 'SteamPath');
  if (reg) candidates.push(reg.replace(/\//g, path.sep));
  const reg2 = await regQuery('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath');
  if (reg2) candidates.push(reg2);
  candidates.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  if (!isWin) candidates.push(path.join(os.homedir(), '.steam', 'steam'), path.join(os.homedir(), '.local', 'share', 'Steam'));
  const steamPath = candidates.find(exists);
  if (!steamPath) return [];
  const libraries = new Set([steamPath]);
  const lf = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
  if (exists(lf)) {
    const v = parseVdf(fs.readFileSync(lf, 'utf8'));
    const libs = v.libraryfolders || v.LibraryFolders || {};
    for (const k of Object.keys(libs)) {
      const entry = libs[k];
      const p = typeof entry === 'object' ? entry.path : entry;
      if (p && exists(p)) libraries.add(p.replace(/\\\\/g, '\\'));
    }
  }
  const games = [];
  for (const lib of libraries) {
    const appsDir = path.join(lib, 'steamapps');
    if (!exists(appsDir)) continue;
    for (const f of fs.readdirSync(appsDir)) {
      const m = f.match(/^appmanifest_(\d+)\.acf$/);
      if (!m) continue;
      const v = parseVdf(fs.readFileSync(path.join(appsDir, f), 'utf8'));
      const app = v.AppState || {};
      const id = app.appid || m[1];
      const name = app.name || `Steam App ${id}`;
      if (/dedicated server|redistributable|proton|steam linux runtime|soundtrack/i.test(name)) continue;
      const installDir = path.join(appsDir, 'common', app.installdir || slug(name));
      const state = Number(app.StateFlags || 0);
      games.push(base(`steam-${id}`, name, {
        source: 'steam', appId: Number(id), installDir,
        installed: (state & 4) !== 0 || exists(installDir),
        launchUri: `steam://rungameid/${id}`,
        cover: steamCover(id), hero: steamHero(id), logo: steamLogo(id),
        cloud: true, platform: 'PC (Windows)'
      }));
    }
  }
  return games;
}

async function findEpic() {
  const dirs = ['C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'];
  const games = [];
  for (const dir of dirs) {
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.item')) continue;
      const m = readJsonSafe(path.join(dir, f));
      if (!m || !m.bIsInstalled) continue;
      const exe = m.LaunchExecutable ? path.join(m.InstallLocation || '', m.LaunchExecutable) : '';
      games.push(base(`epic-${m.AppName || slug(m.DisplayName)}`, m.DisplayName || m.AppName, {
        source: 'epic', appId: m.CatalogItemId || m.AppName,
        installDir: m.InstallLocation || '', exePath: exists(exe) ? exe : '',
        launchUri: `com.epicgames.launcher://apps/${m.CatalogNamespace || m.AppName}%3A${m.CatalogItemId || ''}%3A${m.AppName}?action=launch&silent=true`,
        installed: true, cover: '', hero: '', logo: '', platform: 'PC (Windows)'
      }));
    }
  }
  return games;
}

async function findGog() {
  const games = [];
  const roots = ['HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games', 'HKLM\\SOFTWARE\\GOG.com\\Games'];
  for (const root of roots) {
    const keys = await regQuery(root);
    if (!keys) continue;
    for (const key of keys) {
      const name = await regQuery(key, 'gameName');
      const dir = await regQuery(key, 'path');
      const exe = await regQuery(key, 'exe');
      if (!name) continue;
      games.push(base(`gog-${key.split('\\').pop()}`, name, {
        source: 'gog', installDir: dir || '', exePath: exe || '',
        installed: exists(dir), cloud: false, platform: 'PC (Windows)'
      }));
    }
  }
  return games;
}

async function findRegistryGames() {
  const games = [];
  const roots = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ];
  const gamePublishers = /steam|epic|gog|ubisoft|electronic arts|origin|ea |bethesda|activision|blizzard|rockstar|2k|capcom|square enix|sega|bandai|thq|deep silver|focus|paradox|cd projekt|valve|riot|warner|devolver|team17|frontier|coconut|tinybuild|raw fury|annapurna|hooded|kepler|astragon|kalypso|nacon|bigben|microids|1c|бука|софтклаб|акелла/i;
  for (const root of roots) {
    const keys = await regQuery(root);
    if (!keys) continue;
    for (const key of keys.slice(0, 400)) {
      const name = await regQuery(key, 'DisplayName');
      if (!name) continue;
      if (/update|hotfix|redistributable|driver|runtime|framework|sdk|service pack|security|antivirus|browser|chrome|firefox|edge|office|visual c\+\+|\.net|python|node|git|7-zip|winrar|vlc|discord|telegram|zoom|teams|obs |streamlabs|epic games launcher|steam$/i.test(name)) continue;
      const publisher = (await regQuery(key, 'Publisher')) || '';
      const dir = (await regQuery(key, 'InstallLocation')) || '';
      const icon = (await regQuery(key, 'DisplayIcon')) || '';
      const isGame = gamePublishers.test(publisher) || gamePublishers.test(name) || /games|steamapps|epic games|gog galaxy|origin games|ubisoft game launcher|battle\.net|xboxgames/i.test(dir);
      if (!isGame) continue;
      let exe = icon.split(',')[0].replace(/^"|"$/g, '');
      if (!/\.exe$/i.test(exe) || !exists(exe)) exe = '';
      games.push(base(`reg-${slug(key)}`, name.replace(/\s*(version|v\.?)\s*[\d.]+$/i, ''), {
        source: 'registry', installDir: dir, exePath: exe,
        installed: exists(dir) || exists(exe), developers: [publisher].filter(Boolean), platform: 'PC (Windows)'
      }));
    }
  }
  return games;
}

async function findUbisoft() {
  const games = [];
  const root = 'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs';
  const keys = await regQuery(root);
  if (keys) for (const key of keys) {
    const dir = await regQuery(key, 'InstallDir');
    const id = key.split('\\').pop();
    const name = dir ? path.basename(dir) : `Ubisoft ${id}`;
    games.push(base(`ubisoft-${id}`, name, { source: 'ubisoft', appId: id, installDir: dir || '', installed: exists(dir), launchUri: `uplay://launch/${id}/0`, platform: 'PC (Windows)' }));
  }
  return games;
}

async function findEa() {
  const games = [];
  const roots = ['HKLM\\SOFTWARE\\WOW6432Node\\Electronic Arts', 'HKLM\\SOFTWARE\\EA Games'];
  for (const root of roots) {
    const keys = await regQuery(root);
    if (!keys) continue;
    for (const key of keys) {
      const dir = await regQuery(key, 'Install Dir') || await regQuery(key, 'InstallDir');
      const name = await regQuery(key, 'DisplayName') || key.split('\\').pop();
      if (!dir || /origin|ea app|ea desktop/i.test(name)) continue;
      games.push(base(`ea-${slug(name)}`, name, { source: 'ea', installDir: dir, installed: exists(dir), platform: 'PC (Windows)' }));
    }
  }
  return games;
}

async function findXbox() {
  const games = [];
  const roots = ['C:\\XboxGames', path.join(os.homedir(), 'XboxGames')];
  for (const root of roots) {
    if (!exists(root)) continue;
    for (const d of fs.readdirSync(root)) {
      const content = path.join(root, d, 'Content');
      if (!exists(content)) continue;
      const exe = findMainExe(content);
      games.push(base(`xbox-${slug(d)}`, d, { source: 'xbox', installDir: content, exePath: exe || '', installed: true, platform: 'PC (Windows)' }));
    }
  }
  return games;
}

function findMainExe(dir, depth = 2) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const exes = entries.filter(e => e.isFile() && /\.exe$/i.test(e.name) && !/unins|setup|redist|vcredist|dxsetup|crash|launcher_helper|unitycrashhandler/i.test(e.name));
    if (exes.length) {
      exes.sort((a, b) => fs.statSync(path.join(dir, b.name)).size - fs.statSync(path.join(dir, a.name)).size);
      return path.join(dir, exes[0].name);
    }
    if (depth > 0) for (const e of entries.filter(e => e.isDirectory() && !/^\.|redist|support|_commonredist/i.test(e.name))) {
      const r = findMainExe(path.join(dir, e.name), depth - 1);
      if (r) return r;
    }
  } catch {}
  return null;
}

async function findShortcuts() {
  const games = [];
  const dirs = [
    path.join(os.homedir(), 'Desktop'),
    'C:\\Users\\Public\\Desktop',
    path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'
  ];
  const lnks = [];
  const walk = (d, depth) => {
    if (!exists(d) || depth > 3) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.lnk$/i.test(e.name)) lnks.push(p);
    }
  };
  dirs.forEach(d => walk(d, 0));
  if (!isWin || !lnks.length) return games;
  // Resolve in one PowerShell batch.
  const script = `$sh=New-Object -ComObject WScript.Shell; @'
'@ | Out-Null; $paths=@(${lnks.slice(0, 300).map(p => `'${p.replace(/'/g, "''")}'`).join(',')}); foreach($p in $paths){ $l=$sh.CreateShortcut($p); [pscustomobject]@{Name=[IO.Path]::GetFileNameWithoutExtension($p);Target=$l.TargetPath;Args=$l.Arguments;Work=$l.WorkingDirectory} } | ConvertTo-Json -Compress`;
  try {
    const { stdout } = await pexec('powershell', ['-NoProfile', '-Command', script], { timeout: 20000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    let arr = JSON.parse(stdout || '[]'); if (!Array.isArray(arr)) arr = [arr];
    for (const s of arr) {
      if (!s.Target || !/\.exe$/i.test(s.Target)) continue;
      if (/unins|setup|redist|steam\.exe|epicgameslauncher|galaxyclient|origin\.exe|eadesktop|upc|ubisoftconnect|battle\.net|launcher\.exe$/i.test(s.Target)) continue;
      games.push(base(`lnk-${slug(s.Name)}`, s.Name, { source: 'shortcut', exePath: s.Target, args: s.Args || '', installDir: s.Work || path.dirname(s.Target), installed: exists(s.Target), platform: 'PC (Windows)' }));
    }
  } catch {}
  return games;
}

async function findBattleNet() {
  const games = [];
  const roots = ['C:\\Program Files (x86)', 'C:\\Program Files', 'D:\\Games', 'D:\\Program Files (x86)'];
  const known = ['World of Warcraft', 'Overwatch', 'Diablo III', 'Diablo IV', 'Hearthstone', 'Heroes of the Storm', 'StarCraft II', 'Warcraft III', 'Call of Duty', 'Crash Bandicoot 4'];
  for (const root of roots) {
    if (!exists(root)) continue;
    for (const name of known) {
      const dir = path.join(root, name);
      if (!exists(dir)) continue;
      const exe = findMainExe(dir, 3);
      games.push(base(`bnet-${slug(name)}`, name, { source: 'battlenet', installDir: dir, exePath: exe || '', installed: true, platform: 'PC (Windows)' }));
    }
  }
  const keys = await regQuery('HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall');
  if (keys) for (const key of keys) {
    const pub = await regQuery(key, 'Publisher');
    if (!pub || !/blizzard|activision/i.test(pub)) continue;
    const name = await regQuery(key, 'DisplayName');
    const dir = await regQuery(key, 'InstallLocation');
    if (!name || !dir || !exists(dir)) continue;
    if (games.some(g => g.name.toLowerCase() === name.toLowerCase())) continue;
    games.push(base(`bnet-${slug(name)}`, name, { source: 'battlenet', installDir: dir, exePath: findMainExe(dir, 3) || '', installed: true, developers: [pub], platform: 'PC (Windows)' }));
  }
  return games;
}

async function findItch() {
  const games = [];
  const root = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'itch', 'apps');
  if (!exists(root)) return games;
  for (const d of fs.readdirSync(root)) {
    const dir = path.join(root, d);
    const exe = findMainExe(dir, 2);
    if (exe) games.push(base(`itch-${slug(d)}`, d.replace(/-/g, ' '), { source: 'itch', installDir: dir, exePath: exe, installed: true, platform: 'PC (Windows)' }));
  }
  return games;
}

async function scanFolders(folders) {
  const games = [];
  for (const root of folders || []) {
    if (!exists(root)) continue;
    const walk = (d, depth) => {
      if (depth > 3) return;
      let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      const exes = entries.filter(e => e.isFile() && /\.exe$/i.test(e.name) && !/unins|setup|redist|vcredist|dxsetup|crash|unitycrashhandler/i.test(e.name));
      for (const e of exes) {
        const p = path.join(d, e.name);
        const name = path.basename(d) !== path.basename(root) ? path.basename(d) : path.basename(e.name, '.exe');
        games.push(base(`folder-${slug(p)}`, name, { source: 'manual', installDir: d, exePath: p, installed: true, platform: 'PC (Windows)' }));
      }
      for (const e of entries.filter(e => e.isDirectory() && !/^\.|redist|support|_commonredist|dlc|soundtrack/i.test(e.name))) walk(path.join(d, e.name), depth + 1);
    };
    walk(root, 0);
  }
  return games;
}

async function scanAll(settings, onProgress) {
  const sources = settings.scanSources || {};
  const tasks = [
    ['steam', 'Steam', findSteam],
    ['epic', 'Epic Games', findEpic],
    ['gog', 'GOG', findGog],
    ['ubisoft', 'Ubisoft Connect', findUbisoft],
    ['ea', 'EA / Origin', findEa],
    ['xbox', 'Xbox / Game Pass', findXbox],
    ['itch', 'itch.io', findItch],
    ['battlenet', 'Battle.net', findBattleNet],
    ['shortcuts', 'Ярлыки', findShortcuts],
    ['registry', 'Установленные игры', findRegistryGames],
    ['folders', 'Папки', () => scanFolders(settings.customFolders)]
  ];
  const found = new Map();
  let done = 0;
  const enabled = tasks.filter(([k]) => sources[k] !== false);
  for (const [key, label, fn] of enabled) {
    onProgress && onProgress({ phase: 'scan', source: label, done, total: enabled.length });
    try {
      const list = await fn();
      for (const g of list) {
        const dup = [...found.values()].find(x => x.name.toLowerCase() === g.name.toLowerCase() || (x.exePath && x.exePath === g.exePath));
        if (dup) { dup.installed = dup.installed || g.installed; if (!dup.exePath && g.exePath) dup.exePath = g.exePath; continue; }
        found.set(g.id, g);
      }
    } catch (e) { console.error('scan source failed', key, e.message); }
    done++;
    onProgress && onProgress({ phase: 'scan', source: label, done, total: enabled.length });
  }
  return [...found.values()];
}

module.exports = { scanAll, findMainExe, parseVdf, slug, steamCover, steamHero, steamLogo };
