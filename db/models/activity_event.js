const { makeModel } = require('./_base');
const { query } = require('../client');

// activity_events are append-only and have no updated_at.
const base = makeModel({
  table: 'activity_events',
  pk: 'activity_event_id',
  columns: [
    'activity_event_id', 'job_id', 'actor_id', 'event_type', 'payload',
    'created_at',
  ],
});

// Activity is immutable. Override update/remove to throw rather than silently allow.
async function update() {
  throw new Error('[activity_events] activity is immutable; new events must be created, not updated');
}
async function remove() {
  throw new Error('[activity_events] activity is immutable; events cannot be deleted');
}

async function listByJobId(jobId, { limit = 200, offset = 0 } = {}) {
  const { rows } = await query(
    'SELECT * FROM activity_events WHERE job_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [jobId, limit, offset]
  );
  return rows;
}

async function listRecent({ limit = 100, offset = 0 } = {}) {
  const { rows } = await query(
    'SELECT * FROM activity_events ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return rows;
}

module.exports = {
  get: base.get,
  list: base.list,
  create: base.create,
  update,
  remove,
  delete: remove,
  listByJobId,
  listRecent,
};
