/**
 * Model base — shared CRUD scaffolding for the doctrine entities.
 *
 * Every model file calls makeModel({ table, pk, columns }) and gets a uniform
 * surface: get, list, create, update, remove (also exported as `delete`).
 * Models can add custom finder methods on top.
 *
 * All SQL is parameterized. No string concatenation of user input.
 */

const { query } = require('../client');

function makeModel({ table, pk, columns }) {
  const colList = columns.join(', ');

  async function get(id) {
    const { rows } = await query(
      `SELECT ${colList} FROM ${table} WHERE ${pk} = $1`,
      [id]
    );
    return rows[0] || null;
  }

  async function list({
    where = {},
    limit = 200,
    offset = 0,
    orderBy = 'created_at',
    orderDir = 'DESC',
  } = {}) {
    if (!columns.includes(orderBy)) {
      throw new Error(`[${table}.list] orderBy '${orderBy}' is not a column`);
    }
    const dir = String(orderDir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const keys = Object.keys(where).filter((k) => columns.includes(k));
    const values = [];
    const clauses = [];
    keys.forEach((k) => {
      values.push(where[k]);
      clauses.push(`${k} = $${values.length}`);
    });
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT ${colList} FROM ${table} ${whereSql} ORDER BY ${orderBy} ${dir} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    const { rows } = await query(sql, values);
    return rows;
  }

  async function create(data) {
    const keys = Object.keys(data).filter(
      (k) => columns.includes(k) && data[k] !== undefined
    );
    if (keys.length === 0) {
      throw new Error(`[${table}.create] no valid columns provided`);
    }
    const placeholders = keys.map((_, i) => `$${i + 1}`);
    const values = keys.map((k) => data[k]);
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${colList}`;
    const { rows } = await query(sql, values);
    return rows[0];
  }

  async function update(id, patch) {
    const keys = Object.keys(patch).filter(
      (k) => columns.includes(k) && k !== pk && patch[k] !== undefined
    );
    if (keys.length === 0) {
      return get(id);
    }
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [id, ...keys.map((k) => patch[k])];
    const sql = `UPDATE ${table} SET ${sets} WHERE ${pk} = $1 RETURNING ${colList}`;
    const { rows } = await query(sql, values);
    return rows[0] || null;
  }

  async function remove(id) {
    const { rowCount } = await query(
      `DELETE FROM ${table} WHERE ${pk} = $1`,
      [id]
    );
    return rowCount > 0;
  }

  return { get, list, create, update, remove, delete: remove, _table: table, _pk: pk, _columns: columns };
}

module.exports = { makeModel };
