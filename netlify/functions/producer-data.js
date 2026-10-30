// POST { producerId, deviceId }  ->  { producer, clients:[{id,name,code,devices}], animals:[...], review:[...] }
const { db, json, verifyProducer } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { producerId, deviceId } = JSON.parse(event.body || '{}');
  const { data: gate } = await db.from('producers').select('status').eq('id', producerId).maybeSingle();
  if (gate && gate.status !== 'active') return json(403, { error: 'This account is paused.' });
  if (!(await verifyProducer(producerId, deviceId))) return json(403, { error: 'Not signed in' });

  const { data: producer } = await db.from('producers').select('id, name, status').eq('id', producerId).single();

  const { data: clients } = await db
    .from('clients').select('id, name, code, client_devices(device_id, linked_at)').eq('producer_id', producerId);

  const { data: devices } = await db
    .from('producer_devices').select('device_id, linked_at').eq('producer_id', producerId).order('linked_at');

  const { data: animals } = await db
    .from('animals')
    .select('id, client_id, tag, target_lb, status, ship_date, ship_lb, weighins(weigh_date, weight_lb, notes)')
    .eq('producer_id', producerId);

  const { data: review } = await db
    .from('review_queue').select('*').eq('producer_id', producerId).order('created_at', { ascending: true });

  const shapedAnimals = (animals || []).map((a) => ({
    id: a.id, clientId: a.client_id, tag: a.tag, targetLb: a.target_lb,
    status: a.status, shipDate: a.ship_date, shipLb: a.ship_lb,
    weighins: (a.weighins || []).sort((x, y) => x.weigh_date.localeCompare(y.weigh_date)).map((w) => [w.weigh_date, w.weight_lb, w.notes || ''])
  }));

  const shapedClients = (clients || []).map((c) => ({
    id: c.id, name: c.name, code: c.code,
    devicesLinked: (c.client_devices || []).length,
    devices: (c.client_devices || []).map((d) => ({ deviceId: d.device_id, linkedAt: d.linked_at }))
  }));

  const shapedDevices = (devices || []).map((d) => ({ deviceId: d.device_id, linkedAt: d.linked_at }));

  return json(200, { producer, clients: shapedClients, animals: shapedAnimals, review: review || [], devices: shapedDevices });
};
