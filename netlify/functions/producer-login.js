// POST { code, deviceId }  ->  { producer: {id, name} }
// Same four-device model as clients, but an 8-char code.
const { db, json } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { code, deviceId } = JSON.parse(event.body || '{}');
  if (!code || !deviceId) return json(400, { error: 'Missing code or deviceId' });

  const { data: producer } = await db
    .from('producers')
    .select('id, name, status')
    .eq('code', code.trim().toUpperCase())
    .maybeSingle();

  if (!producer) return json(404, { error: 'Code not found' });

  const { data: devices } = await db
    .from('producer_devices')
    .select('device_id')
    .eq('producer_id', producer.id);

  const already = devices.some((d) => d.device_id === deviceId);
  if (!already) {
    if (devices.length >= 4) {
      return json(403, { error: 'This code is already linked to four devices. Contact us for a new code.' });
    }
    await db.from('producer_devices').insert({ producer_id: producer.id, device_id: deviceId });
  }

  return json(200, { producer: { id: producer.id, name: producer.name, status: producer.status } });
};
