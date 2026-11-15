'use strict';
// Playtime tracking. Desktop: spawn the game (or open its launcher URI) and
// poll the process tree until it exits. Web preview: simulated sessions.
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const pexec = promisify(execFile);
const isWin = process.platform === 'win32';

class Tracker {
  constructor(store, opts = {}) {
    this.store = store;
    this.demo = !!opts.demo;
    this.sessions = new Map(); // gameId -> {pid, startedAt, lastTick, demo}
    this.timer = setInterval(() => this.tick(), 5000);
    this.timer.unref && this.timer.unref();
  }
  active() { return [...this.sessions.entries()].map(([gameId, s]) => ({ gameId, ...s, elapsed: Math.floor((Date.now() - s.startedAt) / 1000) })); }
  isRunning(id) { return this.sessions.has(id); }

  async launch(game) {
    if (this.sessions.has(game.id)) return { ok: true, already: true };
    if (!game.installed) return { ok: false, error: 'Игра не установлена' };
    if (this.demo) {
      this.sessions.set(game.id, { pid: -1, startedAt: Date.now(), lastTick: Date.now(), demo: true });
      game.lastPlayed = Date.now();
      this.store.upsert(game);
      return { ok: true, demo: true };
    }
    let pid = null;
    try {
      if (game.exePath && fs.existsSync(game.exePath)) {
        const args = game.args ? game.args.match(/(?:[^\s"]+|"[^"]*")+/g).map(a => a.replace(/^"|"$/g, '')) : [];
        const child = spawn(game.exePath, args, { cwd: game.installDir || path.dirname(game.exePath), detached: true, stdio: 'ignore', windowsHide: false });
        child.unref();
        pid = child.pid;
      } else if (game.launchUri) {
        if (isWin) { const c = spawn('cmd', ['/c', 'start', '', game.launchUri], { detached: true, stdio: 'ignore', windowsHide: true }); c.unref(); }
        else if (process.platform === 'darwin') spawn('open', [game.launchUri], { detached: true, stdio: 'ignore' }).unref();
        else spawn('xdg-open', [game.launchUri], { detached: true, stdio: 'ignore' }).unref();
      } else {
        return { ok: false, error: 'Не указан исполняемый файл или ссылка запуска' };
      }
    } catch (e) { return { ok: false, error: e.message }; }
    this.sessions.set(game.id, { pid, startedAt: Date.now(), lastTick: Date.now(), demo: false, exePath: game.exePath || '', installDir: game.installDir || '' });
    game.lastPlayed = Date.now();
    this.store.upsert(game);
    return { ok: true, pid };
  }

  async processAlive(s, game) {
    if (s.demo) return true;
    if (isWin) {
      try {
        // Match by PID tree or by executable path / install dir.
        const script = `Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath | ConvertTo-Json -Compress`;
        const { stdout } = await pexec('powershell', ['-NoProfile', '-Command', script], { timeout: 12000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
        let arr = JSON.parse(stdout || '[]'); if (!Array.isArray(arr)) arr = [arr];
        const byId = new Map(arr.map(p => [p.ProcessId, p]));
        const roots = new Set();
        if (s.pid && byId.has(s.pid)) roots.add(s.pid);
        const exe = (s.exePath || game.exePath || '').toLowerCase();
        const dir = (s.installDir || game.installDir || '').toLowerCase().replace(/[\\/]+$/, '');
        for (const p of arr) {
          const ep = (p.ExecutablePath || '').toLowerCase();
          if (exe && ep === exe) roots.add(p.ProcessId);
          else if (dir && ep.startsWith(dir + path.sep.toLowerCase())) roots.add(p.ProcessId);
        }
        if (!roots.size) return false;
        let grew = true;
        while (grew) { grew = false; for (const p of arr) if (roots.has(p.ParentProcessId) && !roots.has(p.ProcessId)) { roots.add(p.ProcessId); grew = true; } }
        return roots.size > 0;
      } catch { return s.pid ? true : false; }
    }
    if (s.pid) { try { process.kill(s.pid, 0); return true; } catch { return false; } }
    return false;
  }

  async tick() {
    const now = Date.now();
    for (const [gameId, s] of [...this.sessions.entries()]) {
      const game = this.store.game(gameId);
      if (!game) { this.sessions.delete(gameId); continue; }
      const alive = await this.processAlive(s, game);
      const delta = Math.max(0, Math.min(60, Math.round((now - s.lastTick) / 1000)));
      if (alive) {
        if (this.store.get().settings.trackPlaytime !== false) game.playtimeSeconds = (game.playtimeSeconds || 0) + delta;
        s.lastTick = now;
        this.store.upsert(game);
      } else {
        this.finish(gameId, delta);
      }
    }
  }
  finish(gameId, extra = 0) {
    const s = this.sessions.get(gameId);
    if (!s) return null;
    const game = this.store.game(gameId);
    const elapsed = Math.floor((Date.now() - s.startedAt) / 1000) + extra;
    this.sessions.delete(gameId);
    
    if (game) {
      // Время уже посчитано в tick(), здесь просто уведомляем
      this.store.notify('success', 'Сессия завершена', `${game.name} — ${fmt(elapsed)} добавлено ко времени в игре.`);
      this.store.save(true);
    }
    return { gameId, elapsed };
  }
  stop(gameId) { return this.finish(gameId); }
  stopAll() { for (const id of [...this.sessions.keys()]) this.finish(id); }
}
function fmt(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h} ч ${m} мин`;
  if (m) return `${m} мин ${s} с`;
  return `${s} с`;
}
module.exports = { Tracker, fmt };