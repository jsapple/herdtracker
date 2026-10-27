// POST { producerId, deviceId, name }  ->  { client: {id, name, code} }
const { db, json, makeCode, verifyProducer } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { producerId, deviceId, name } = JSON.parse(event.body || '{}');
  if (!(await verifyProducer(producerId, deviceId))) return json(403, { error: 'Not signed in' });
  const clientName = (name || '').trim();
  if (!clientName) return json(400, { error: 'Client name is required' });

  // Codes only need to be unique within this producer's own clients.
  let code;
  for (let tries = 0; tries < 5; tries++) {
    code = makeCode(6);
    const { data: clash } = await db
      .from('clients')
      .select('id')
      .eq('producer_id', producerId)
      .eq('code', code)
      .maybeSingle();
    if (!clash) break;
  }

  const { data: client, error } = await db
    .from('clients')
    .insert({ producer_id: producerId, name: clientName, code })
    .select('id, name, code')
    .single();

  if (error) {
    if (error.code === '23505') return json(409, { error: 'A client with that name already exists.' });
    return json(500, { error: 'Could not add client' });
  }
  return json(200, { client });
};
