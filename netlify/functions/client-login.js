// POST { code, deviceId }  ->  { client: {id, name, producerId} }
// Up to 5 phones. A new phone takes the seat of the one opened least recently.
const { db, json, claimDevice } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { code, deviceId } = JSON.parse(event.body || '{}');
  if (!code || !deviceId) return json(400, { error: 'Missing code or deviceId' });

  const { data: client } = await db
    .from('clients')
    .select('id, name, producer_id')
    .eq('code', code.trim().toUpperCase())
    .maybeSingle();

  if (!client) return json(404, { error: 'Code not found' });

  const claimed = await claimDevice('client_devices', 'client_id', client.id, deviceId);
  if (!claimed.ok) return json(403, { error: claimed.error });

  return json(200, { client: { id: client.id, name: client.name, producerId: client.producer_id } });
};
