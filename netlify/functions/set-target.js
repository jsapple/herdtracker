// POST { role:'producer'|'client', producerId?, clientId, deviceId, animalId, targetLb }
// Either the producer or the client who owns the animal can change its target.
const { db, json, verifyProducer, verifyClient, clientBelongsToProducer } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { role, producerId, clientId, deviceId, animalId, targetLb, all } = JSON.parse(event.body || '{}');
  if (targetLb == null || Number.isNaN(Number(targetLb))) return json(400, { error: 'Enter a target weight.' });
  const lb = Math.min(2500, Math.max(600, Math.round(Number(targetLb) / 5) * 5));

  if (role === 'client') {
    if (!(await verifyClient(clientId, deviceId))) return json(403, { error: 'Not signed in' });
  } else {
    if (!(await verifyProducer(producerId, deviceId))) return json(403, { error: 'Not signed in' });
    if (!(await clientBelongsToProducer(clientId, producerId))) return json(404, { error: 'Client not found' });
  }

  if (!all && !animalId) return json(400, { error: 'Missing animal' });
  let q = db.from('animals').update({ target_lb: lb }).eq('client_id', clientId);
  q = all ? q.eq('status', 'active') : q.eq('id', animalId);
  const { error } = await q;
  if (error) return json(500, { error: 'Could not update target' });
  return json(200, { targetLb: lb });
};
