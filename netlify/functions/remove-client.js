// POST { producerId, deviceId, clientId }
// Deletes one client. Phones, animals, weigh-ins, and review rows follow
// because those tables cascade from clients.
const { db, json, verifyProducer, clientBelongsToProducer } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { producerId, deviceId, clientId } = JSON.parse(event.body || '{}');
  if (!(await verifyProducer(producerId, deviceId))) return json(403, { error: 'Not signed in' });
  if (!(await clientBelongsToProducer(clientId, producerId))) return json(404, { error: 'Client not found' });

  const { data, error } = await db
    .from('clients')
    .delete()
    .eq('id', clientId)
    .eq('producer_id', producerId)
    .select('id');
  if (error) return json(500, { error: 'Could not remove the client' });
  if (!data || !data.length) return json(404, { error: 'Client not found' });
  return json(200, { ok: true });
};
