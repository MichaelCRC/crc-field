const { makeModel } = require('./_base');
const { query } = require('../client');

const base = makeModel({
  table: 'customers',
  pk: 'customer_id',
  columns: [
    'customer_id', 'first_name', 'last_name',
    'primary_phone', 'primary_email', 'secondary_phone', 'secondary_email',
    'jn_contact_id', 'created_at', 'updated_at',
  ],
});

async function findByPrimaryPhone(phone) {
  const { rows } = await query(
    'SELECT * FROM customers WHERE primary_phone = $1 ORDER BY created_at DESC LIMIT 1',
    [phone]
  );
  return rows[0] || null;
}

async function findByJnContactId(jnContactId) {
  const { rows } = await query(
    'SELECT * FROM customers WHERE jn_contact_id = $1',
    [jnContactId]
  );
  return rows[0] || null;
}

module.exports = { ...base, findByPrimaryPhone, findByJnContactId };
