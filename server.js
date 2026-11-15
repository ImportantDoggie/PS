'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Store } = require('./lib/store');
const { Tracker } = require('./lib/tracker');
const { scanAll, slug, steamCover, steamHero, steamLogo, findMainExe } = require('./lib/scanner');
const { base, seedState } = require('./lib/seed');

function createApp(opts = {}) {
  const demo = opts.demo !== false && !opts.desktop;
  const dataFile = opts.dataFile || (demo ? path.join(__dirname, 'data', 'demo-library.json') : null);
  const store = new Store(dataFile);
  const tracker = new Tracker(store, { demo });
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });

  let scanStatus = { running: false, phase: 'idle', done: 0, total: 0, source: '', found: 0, error: null };
  const clients = new Set();
  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) { try { c.write(payload); } catch {} }
  }
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();
    res.write(`event: hello\ndata: {}\n\n`);
    clients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
  });

  const publicState = () => ({
    mode: demo ? 'preview' : 'desktop',
    platform: process.platform,
    games: store.get().games,
    settings: store.get().settings,
    views: store.get().views,
    notifications: store.get().notifications,
    sessions: tracker.active(),
    scan: scanStatus
  });

  app.get('/api/state', (req, res) => res.json(publicState()));

  app.post('/api/scan', async (req, res) => {
    if (scanStatus.running) return res.json({ ok: true, already: true });
    scanStatus = { running: true, phase: 'scan', done: 0, total: 0, source: 'Подготовка', found: 0, error: null };
    broadcast('scan', scanStatus);
    res.json({ ok: true });
    (async () => {
      try {
        let found;
        if (demo) {
          const steps = ['Steam', 'Epic Games', 'GOG', 'Ярлыки', 'Реестр Windows'];
          for (let i = 0; i < steps.length; i++) {
            scanStatus = { ...scanStatus, source: steps[i], done: i, total: steps.length };
            broadcast('scan', scanStatus);
            await new Promise(r => setTimeout(r, 450));
          }
          found = seedState().games;
          scanStatus = { ...scanStatus, done: steps.length, total: steps.length };
        } else {
          found = await scanAll(store.get().settings, p => { scanStatus = { ...scanStatus, ...p }; broadcast('scan', scanStatus); });
        }
        let added = 0, updated = 0;
        const existing = store.get().games;
        for (const g of found) {
          const dup = existing.find(x => x.id === g.id || (x.appId && g.appId && x.appId === g.appId && x.source === g.source) || x.name.toLowerCase() === g.name.toLowerCase());
          if (dup) {
            dup.installed = g.installed;
            if (g.installDir) dup.installDir = g.installDir;
            if (g.exePath) dup.exePath = g.exePath;
            if (g.launchUri) dup.launchUri = g.launchUri;
            if (!dup.cover && g.cover) dup.cover = g.cover;
            if (!dup.hero && g.hero) dup.hero = g.hero;
            if (!dup.logo && g.logo) dup.logo = g.logo;
            updated++;
          } else {
            g.order = existing.length + added;
            g.addedAt = Date.now();
            existing.push(g);
            added++;
          }
        }
        // Enrich Steam metadata (year/genres) lazily for new entries.
        store.save(true);
        scanStatus = { running: false, phase: 'done', done: scanStatus.total, total: scanStatus.total, source: '', found: found.length, added, updated, error: null };
        store.notify('success', 'Сканирование завершено', `Найдено ${found.length} игр: ${added} новых, ${updated} обновлено.`);
        broadcast('scan', scanStatus);
        broadcast('library', { games: store.get().games });
      } catch (e) {
        scanStatus = { running: false, phase: 'error', done: 0, total: 0, source: '', found: 0, error: e.message };
        broadcast('scan', scanStatus);
      }
    })();
  });
  app.get('/api/scan/status', (req, res) => res.json(scanStatus));

  app.post('/api/games', (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ ok: false, error: 'Укажите название' });
    const id = b.id || `manual-${slug(b.name)}-${Date.now().toString(36)}`;
    const existing = store.game(id);
    const g = base(id, String(b.name).trim(), {
      ...(existing || {}),
      source: b.source || existing?.source || 'manual',
      exePath: b.exePath || '',
      args: b.args || '',
      installDir: b.installDir || (b.exePath ? path.dirname(b.exePath) : ''),
      launchUri: b.launchUri || '',
      installed: b.installed !== undefined ? !!b.installed : true,
      favorite: !!b.favorite,
      hidden: !!b.hidden,
      releaseYear: b.releaseYear || null,
      cover: b.cover || '',
      hero: b.hero || b.cover || '',
      logo: b.logo || '',
      description: b.description || '',
      genres: Array.isArray(b.genres) ? b.genres : String(b.genres || '').split(',').map(s => s.trim()).filter(Boolean),
      developers: Array.isArray(b.developers) ? b.developers : String(b.developers || '').split(',').map(s => s.trim()).filter(Boolean),
      order: existing ? existing.order : store.get().games.length,
      playtimeSeconds: b.playtimeSeconds !== undefined ? Number(b.playtimeSeconds) || 0 : (existing?.playtimeSeconds || 0),
      addedAt: existing?.addedAt || Date.now()
    });
    if (!g.exePath && g.installDir) { const exe = findMainExe(g.installDir); if (exe) g.exePath = exe; }
    store.upsert(g);
    broadcast('library', { games: store.get().games });
    res.json({ ok: true, game: g });
  });

  app.patch('/api/games/:id', (req, res) => {
    const g = store.game(req.params.id);
    if (!g) return res.status(404).json({ ok: false, error: 'Игра не найдена' });
    const allowed = ['name', 'favorite', 'hidden', 'installed', 'exePath', 'args', 'installDir', 'launchUri', 'cover', 'hero', 'logo', 'description', 'genres', 'developers', 'releaseYear', 'playtimeSeconds', 'order', 'source'];
    for (const k of allowed) if (req.body[k] !== undefined) g[k] = req.body[k];
    if (req.body.name) g.sortName = String(req.body.name).toLowerCase().replace(/^(the|a|an)\s+/i, '');
    store.upsert(g);
    broadcast('library', { games: store.get().games });
    res.json({ ok: true, game: g });
  });

  app.delete('/api/games/:id', (req, res) => {
    const g = store.remove(req.params.id);
    if (!g) return res.status(404).json({ ok: false, error: 'Игра не найдена' });
    broadcast('library', { games: store.get().games });
    res.json({ ok: true, game: g });
  });

  app.post('/api/games/:id/restore', (req, res) => {
    const g = req.body;
    if (!g || !g.id) return res.status(400).json({ ok: false });
    store.upsert(g);
    broadcast('library', { games: store.get().games });
    res.json({ ok: true });
  });

  app.post('/api/games/:id/favorite', (req, res) => {
    const g = store.game(req.params.id);
    if (!g) return res.status(404).json({ ok: false });
    g.favorite = req.body.favorite !== undefined ? !!req.body.favorite : !g.favorite;
    store.upsert(g);
    broadcast('library', { games: store.get().games });
    res.json({ ok: true, game: g });
  });

  app.post('/api/games/:id/launch', async (req, res) => {
    const g = store.game(req.params.id);
    if (!g) return res.status(404).json({ ok: false, error: 'Игра не найдена' });
    const r = await tracker.launch(g);
    if (r.ok) { broadcast('session', { type: 'started', gameId: g.id, demo: !!r.demo }); store.notify('info', 'Игра запущена', g.name); }
    res.json(r);
  });
  app.post('/api/games/:id/stop', (req, res) => {
    const r = tracker.stop(req.params.id);
    broadcast('session', { type: 'stopped', gameId: req.params.id, elapsed: r?.elapsed || 0 });
    broadcast('library', { games: store.get().games });
    res.json({ ok: true, ...r });
  });
  app.post('/api/games/:id/install', async (req, res) => {
    const g = store.game(req.params.id);
    if (!g) return res.status(404).json({ ok: false });
    if (demo) {
      g.installed = true; store.upsert(g);
      store.notify('success', 'Установка завершена', `${g.name} готова к запуску.`);
      broadcast('library', { games: store.get().games });
      return res.json({ ok: true, demo: true });
    }
    let uri = g.launchUri;
    if (g.source === 'steam' && g.appId) uri = `steam://install/${g.appId}`;
    if (uri) {
      const { spawn } = require('child_process');
      if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', uri], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      else spawn('xdg-open', [uri], { detached: true, stdio: 'ignore' }).unref();
      return res.json({ ok: true, opened: uri });
    }
    res.json({ ok: false, error: 'Нет ссылки установки. Откройте магазин вручную.' });
  });

  app.post('/api/reorder', (req, res) => {
    const ids = req.body.ids || [];
    const games = store.get().games;
    ids.forEach((id, i) => { const g = games.find(x => x.id === id); if (g) g.order = i; });
    games.sort((a, b) => (a.order || 0) - (b.order || 0));
    store.save();
    broadcast('library', { games });
    res.json({ ok: true });
  });

  app.post('/api/bulk', (req, res) => {
    const { ids = [], action, value } = req.body || {};
    const games = store.get().games;
    const removed = [];
    for (const id of ids) {
      const g = games.find(x => x.id === id);
      if (!g) continue;
      if (action === 'favorite') g.favorite = !!value;
      else if (action === 'hide') g.hidden = !!value;
      else if (action === 'install') g.installed = !!value;
      else if (action === 'delete') { removed.push(g); store.remove(id); }
    }
    store.save();
    broadcast('library', { games: store.get().games });
    res.json({ ok: true, removed });
  });

  app.post('/api/settings', (req, res) => {
    const s = store.get().settings;
    Object.assign(s, req.body || {});
    if (req.body.scanSources) s.scanSources = { ...s.scanSources, ...req.body.scanSources };
    store.save();
    broadcast('settings', s);
    res.json({ ok: true, settings: s });
  });

  app.post('/api/views', (req, res) => {
    const v = { id: 'v' + Date.now().toString(36), name: req.body.name || 'Вид', tab: req.body.tab || 'all', search: req.body.search || '', filter: req.body.filter || {}, sort: req.body.sort || 'manual' };
    store.get().views.push(v); store.save();
    res.json({ ok: true, view: v });
  });
  app.delete('/api/views/:id', (req, res) => {
    store.get().views = store.get().views.filter(v => v.id !== req.params.id); store.save();
    res.json({ ok: true });
  });

  app.post('/api/notifications/read', (req, res) => {
    const ids = req.body.ids;
    for (const n of store.get().notifications) if (!ids || ids.includes(n.id)) n.read = true;
    store.save(); res.json({ ok: true });
  });
  app.delete('/api/notifications', (req, res) => { store.get().notifications = []; store.save(); res.json({ ok: true }); });

  app.get('/api/export', (req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="library.json"');
    res.json(store.get());
  });
  app.post('/api/import', (req, res) => {
    const b = req.body;
    if (!b || !Array.isArray(b.games)) return res.status(400).json({ ok: false, error: 'Неверный файл' });
    store.get().games = b.games;
    if (b.settings) store.get().settings = { ...store.get().settings, ...b.settings };
    if (b.views) store.get().views = b.views;
    store.save(true);
    broadcast('library', { games: store.get().games });
    res.json({ ok: true });
  });
  app.post('/api/reset', (req, res) => {
    store.state = seedState(); store.save(true);
    broadcast('library', { games: store.get().games });
    res.json({ ok: true });
  });

  // Desktop-only helpers injected by Electron main.
  app.post('/api/desktop/:action', async (req, res) => {
    if (!opts.desktopHooks || !opts.desktopHooks[req.params.action]) return res.status(400).json({ ok: false, error: 'Доступно только в desktop-версии' });
    try { res.json(await opts.desktopHooks[req.params.action](req.body || {})); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  for (const mount of opts.staticDirs || []) app.use(mount.route, express.static(mount.dir));
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: demo ? 0 : '1h' }));
  app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  app.use((err, req, res, next) => { console.error(err); res.status(500).json({ ok: false, error: err.message }); });

  return { app, store, tracker, broadcast };
}

module.exports = { createApp };
