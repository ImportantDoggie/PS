'use strict';
const fs = require('fs');
const path = require('path');
const { seedState } = require('./seed');

class Store {
  constructor(file) {
    this.file = file;
    this.state = null;
    this._saveTimer = null;
    this.load();
  }
  load() {
    try {
      if (this.file && fs.existsSync(this.file)) {
        this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        const seed = seedState();
        this.state.settings = { ...seed.settings, ...(this.state.settings || {}) };
        this.state.settings.scanSources = { ...seed.settings.scanSources, ...(this.state.settings.scanSources || {}) };
        if (!Array.isArray(this.state.games)) this.state.games = seed.games;
        if (!Array.isArray(this.state.views)) this.state.views = seed.views;
        if (!Array.isArray(this.state.notifications)) this.state.notifications = [];
        if (!Array.isArray(this.state.sessions)) this.state.sessions = [];
        return;
      }
    } catch (e) { console.error('store load failed', e); }
    this.state = seedState();
    this.save(true);
  }
  save(immediate) {
    if (!this.file) return;
    const write = () => {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = this.file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
        fs.renameSync(tmp, this.file);
      } catch (e) { console.error('store save failed', e); }
    };
    if (immediate) return write();
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(write, 400);
  }
  get() { return this.state; }
  game(id) { return this.state.games.find(g => g.id === id); }
  upsert(game) {
    const i = this.state.games.findIndex(g => g.id === game.id);
    if (i >= 0) this.state.games[i] = { ...this.state.games[i], ...game };
    else this.state.games.push(game);
    this.save();
    return this.game(game.id);
  }
  remove(id) {
    const i = this.state.games.findIndex(g => g.id === id);
    if (i < 0) return null;
    const [g] = this.state.games.splice(i, 1);
    this.save();
    return g;
  }
  notify(type, title, body) {
    const n = { id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6), type, title, body, ts: Date.now(), read: false };
    this.state.notifications.unshift(n);
    this.state.notifications = this.state.notifications.slice(0, 50);
    this.save();
    return n;
  }
}
module.exports = { Store };
