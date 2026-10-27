// POST { producerId, deviceId, clientId, shipDate, animals:[{id, shipLb}] }
const { db, json, verifyProducer, clientBelongsToProducer, parseIsoDate } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { producerId, deviceId, clientId, shipDate, animals } = JSON.parse(event.body || '{}');
  if (!(await verifyProducer(producerId, deviceId))) return json(403, { error: 'Not signed in' });
  if (!(await clientBelongsToProducer(clientId, producerId))) return json(404, { error: 'Client not found' });
  const date = parseIsoDate(shipDate);
  if (!date || !Array.isArray(animals) || !animals.length) return json(400, { error: 'Pick a real ship date and at least one animal.' });

  let n = 0;
  for (const a of animals) {
    const { error } = await db
      .from('animals')
      .update({ status: 'shipped', ship_date: date, ship_lb: a.shipLb == null ? null : Math.round(Number(a.shipLb)) })
      .eq('id', a.id).eq('client_id', clientId);
    if (!error) n++;
  }
  return json(200, { shipped: n });
};
