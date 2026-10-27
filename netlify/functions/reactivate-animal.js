// POST { producerId, deviceId, clientId, animalId }
// The two-tap confirmation lives in the UI; this just performs the one action.
const { db, json, verifyProducer, clientBelongsToProducer } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { producerId, deviceId, clientId, animalId } = JSON.parse(event.body || '{}');
  if (!(await verifyProducer(producerId, deviceId))) return json(403, { error: 'Not signed in' });
  if (!(await clientBelongsToProducer(clientId, producerId))) return json(404, { error: 'Client not found' });

  const { error } = await db
    .from('animals')
    .update({ status: 'active', ship_date: null, ship_lb: null })
    .eq('id', animalId).eq('client_id', clientId);
  if (error) return json(500, { error: 'Could not reactivate' });
  return json(200, { ok: true });
};
