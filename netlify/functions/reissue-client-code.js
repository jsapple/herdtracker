// POST { producerId, deviceId, clientId }  ->  { code }
// Kills the old code and unlinks both of the client's devices.
const { db, json, makeCode, verifyProducer } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { producerId, deviceId, clientId } = JSON.parse(event.body || '{}');
  if (!(await verifyProducer(producerId, deviceId))) return json(403, { error: 'Not signed in' });

  let code;
  for (let tries = 0; tries < 5; tries++) {
    code = makeCode(6);
    const { data: clash } = await db
      .from('clients').select('id').eq('producer_id', producerId).eq('code', code).maybeSingle();
    if (!clash) break;
  }

  const { error } = await db
    .from('clients')
    .update({ code })
    .eq('id', clientId)
    .eq('producer_id', producerId); // can't touch another producer's client
  if (error) return json(500, { error: 'Could not reissue code' });

  await db.from('client_devices').delete().eq('client_id', clientId);
  return json(200, { code });
};
