// POST { code, deviceId }  ->  { client: {id, name, producerId} }
// Up to 4 devices per client code. Code never expires once linked.
const { db, json } = require('./lib/db');

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

  const { data: devices } = await db
    .from('client_devices')
    .select('device_id')
    .eq('client_id', client.id);

  const already = devices.some((d) => d.device_id === deviceId);
  if (!already) {
    if (devices.length >= 4) {
      return json(403, { error: 'This code is already linked to four devices. Ask your producer for a new code.' });
    }
    await db.from('client_devices').insert({ client_id: client.id, device_id: deviceId });
  }

  return json(200, { client: { id: client.id, name: client.name, producerId: client.producer_id } });
};
