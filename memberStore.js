const fs = require('fs');
const path = require('path');

function resolveDir() {
  const preferred = process.env.DATA_DIR || '/data';
  try { fs.mkdirSync(preferred, { recursive: true }); fs.accessSync(preferred, fs.constants.W_OK); return preferred; }
  catch { const fallback = path.join(__dirname, 'data'); fs.mkdirSync(fallback, { recursive: true }); return fallback; }
}

const DB = path.join(resolveDir(), 'memberData.json');

function load() {
  if (!fs.existsSync(DB)) { fs.writeFileSync(DB, '{}', 'utf8'); return {}; }
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return {}; }
}

function save(data) { fs.writeFileSync(DB, JSON.stringify(data, null, 2), 'utf8'); }

function saveMember(userId, roleIds, jetons) {
  const db = load();
  db[userId] = { roleIds, jetons };
  save(db);
}

function getMember(userId) { return load()[userId] || null; }
function clearMember(userId) { const db = load(); delete db[userId]; save(db); }

module.exports = { saveMember, getMember, clearMember };
