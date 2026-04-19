const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, 'jetons.json');

function load() {
  if (!fs.existsSync(DB)) { fs.writeFileSync(DB, '{}', 'utf8'); return {}; }
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return {}; }
}

function save(data) {
  fs.writeFileSync(DB, JSON.stringify(data, null, 2), 'utf8');
}

function get(id) {
  return load()[id] ?? 0;
}

function set(id, n) {
  const db = load();
  db[id] = Math.max(0, Math.floor(n));
  save(db);
  return db[id];
}

function add(id, n) { return set(id, get(id) + n); }
function remove(id, n) { return set(id, get(id) - n); }

module.exports = { get, set, add, remove };
