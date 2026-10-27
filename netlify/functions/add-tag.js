// POST { producerId, deviceId, clientId, tag }
// Adds an active animal with no weight yet. A shipped tag can be used again.
const { db, json, verifyProducer, clientBelongsToProducer, parseTag } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { producerId, deviceId, clientId, tag: raw } = JSON.parse(event.body || '{}');
  if (!(await verifyProducer(producerId, deviceId))) return json(403, { error: 'Not signed in' });
  if (!(await clientBelongsToProducer(clientId, producerId))) return json(404, { error: 'Client not found' });
  const tag = parseTag(raw);
  if (!tag) return json(400, { error: 'Enter the tag as a number.' });

  const { data: animals, error: loadErr } = await db
    .from('animals')
    .select('id, tag, status')
    .eq('client_id', clientId)
    .eq('producer_id', producerId);
  if (loadErr) return json(500, { error: 'Could not load animals' });
  if ((animals || []).some((a) => a.status === 'active' && parseTag(a.tag) === tag)) {
    return json(409, { error: 'Tag ' + tag + ' is already active on this client.' });
  }

  const { data, error } = await db
    .from('animals')
    .insert({ producer_id: producerId, client_id: clientId, tag, target_lb: 1500, status: 'active' })
    .select('id, tag')
    .single();
  if (error) {
    if (error.code === '23505') return json(409, { error: 'Tag ' + tag + ' is already active on this client.' });
    return json(500, { error: 'Could not add the tag' });
  }
  return json(200, { animal: data });
};
