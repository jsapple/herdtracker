// POST { producerId, deviceId, scope:'producer'|'client', clientId?, removeId }
// Drops one linked device. Does not change the sign-in code.
// Removing the device making the request is reported so the app can sign out.
const { db, json, verifyProducer, clientBelongsToProducer } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { producerId, deviceId, scope, clientId, removeId } = JSON.parse(event.body || '{}');
  if (!(await verifyProducer(producerId, deviceId))) return json(403, { error: 'Not signed in' });
  if (!removeId) return json(400, { error: 'Missing device' });

  if (scope === 'client') {
    if (!(await clientBelongsToProducer(clientId, producerId))) return json(404, { error: 'Client not found' });
    const { data, error } = await db.from('client_devices').delete()
      .eq('client_id', clientId).eq('device_id', removeId).select('device_id');
    if (error) return json(500, { error: 'Could not remove the device' });
    if (!data || !data.length) return json(404, { error: 'Device not found' });
    return json(200, { ok: true, signedOut: false });
  }

  const { data, error } = await db.from('producer_devices').delete()
    .eq('producer_id', producerId).eq('device_id', removeId).select('device_id');
  if (error) return json(500, { error: 'Could not remove the device' });
  if (!data || !data.length) return json(404, { error: 'Device not found' });
  return json(200, { ok: true, signedOut: removeId === deviceId });
};
