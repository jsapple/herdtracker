// POST { secret, producerId }
// Deletes the producer. Clients, cattle, and weights cascade with the row.
const { db, json, adminOk } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { secret, producerId } = JSON.parse(event.body || '{}');
  if (!adminOk(secret)) return json(403, { error: 'Wrong secret' });
  if (!producerId) return json(400, { error: 'Missing producer' });

  const { data, error } = await db
    .from('producers')
    .delete()
    .eq('id', producerId)
    .select('id');
  if (error) return json(500, { error: 'Could not delete the account' });
  if (!data || !data.length) return json(404, { error: 'Producer not found' });
  return json(200, { ok: true });
};
