const { makeModel } = require('./_base');
const { query } = require('../client');

const base = makeModel({
  table: 'users',
  pk: 'user_id',
  columns: [
    'user_id', 'email', 'name', 'role', 'rep_code', 'password_hash', 'phone',
    'field_app_access', 'portal_access', 'active', 'last_login_at',
    'created_at', 'updated_at',
  ],
});

async function findByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
}

async function findByRepCode(repCode) {
  const { rows } = await query('SELECT * FROM users WHERE rep_code = $1', [repCode]);
  return rows[0] || null;
}

module.exports = { ...base, findByEmail, findByRepCode };
