/**
 * Postgres client — single pool, shared across the portal.
 *
 * Connection string priority:
 *   1. DATABASE_URL  (Render-injected, internal hostname, used in production)
 *   2. CRC_DB_EXTERNAL_URL  (developer shell, external hostname, used locally)
 *
 * SSL is required on Render in both internal and external mode. The pool
 * uses rejectUnauthorized: false because Render's certificate chain isn't
 * trusted by Node's default CA bundle. This is the documented Render pattern.
 *
 * See CRC_SCHEMA_DOCTRINE.md for the data model this client serves.
 */

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.CRC_DB_EXTERNAL_URL;

if (!connectionString) {
  throw new Error('[db] DATABASE_URL or CRC_DB_EXTERNAL_URL must be set');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[db] unexpected pool error:', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
