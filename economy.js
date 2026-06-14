const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function get(id) {
  const { rows } = await pool.query(
    'SELECT balance FROM economy WHERE discord_id = $1',
    [id]
  );
  return rows[0]?.balance ?? 5000;
}

async function set(id, n) {
  const val = Math.max(0, Math.floor(n));
  const { rows } = await pool.query(
    `INSERT INTO economy (discord_id, balance) VALUES ($1, $2)
     ON CONFLICT (discord_id) DO UPDATE SET balance = $2, updated_at = NOW()
     RETURNING balance`,
    [id, val]
  );
  return rows[0].balance;
}

async function add(id, n) { return set(id, (await get(id)) + n); }
async function remove(id, n) { return set(id, (await get(id)) - n); }

module.exports = { get, set, add, remove };

