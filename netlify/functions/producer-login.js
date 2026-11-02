// POST { code, deviceId }  ->  { producer: {id, name} }
// Up to 5 phones. A new phone takes the seat of the one opened least recently.
const { db, json, claimDevice } = require('./lib/db');

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
  if (producer.status !== 'active') return json(403, { error: 'This account is paused.' });

  const claimed = await claimDevice('producer_devices', 'producer_id', producer.id, deviceId);
  if (!claimed.ok) return json(403, { error: claimed.error });

  return json(200, { producer: { id: producer.id, name: producer.name, status: producer.status } });
};
