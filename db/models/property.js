const { makeModel } = require('./_base');
const { query } = require('../client');

const base = makeModel({
  table: 'properties',
  pk: 'property_id',
  columns: [
    'property_id', 'customer_id', 'street_address', 'city', 'state', 'zip',
    'county', 'latitude', 'longitude', 'created_at', 'updated_at',
  ],
});

async function listByCustomerId(customerId) {
  const { rows } = await query(
    'SELECT * FROM properties WHERE customer_id = $1 ORDER BY created_at DESC',
    [customerId]
  );
  return rows;
}

module.exports = { ...base, listByCustomerId };
