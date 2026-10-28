// POST { secret, producerId, status:'active'|'lapsed' }
// lapsed is the paused state. Cattle and weights stay.
const { db, json, adminOk } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { secret, producerId, status } = JSON.parse(event.body || '{}');
  if (!adminOk(secret)) return json(403, { error: 'Wrong secret' });
  if (status !== 'active' && status !== 'lapsed') return json(400, { error: 'Status must be active or paused' });
  if (!producerId) return json(400, { error: 'Missing producer' });

  const { data, error } = await db
    .from('producers')
    .update({ status })
    .eq('id', producerId)
    .select('id, status');
  if (error) return json(500, { error: 'Could not update the account' });
  if (!data || !data.length) return json(404, { error: 'Producer not found' });
  return json(200, { ok: true, status: data[0].status });
};
