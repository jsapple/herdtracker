// POST { clientId, deviceId }  ->  { client, animals: [{id, tag, target_lb, status, ship_date, ship_lb, weighins:[[date,weight,notes]]}] }
// Everything a client's dashboard needs, in one call.
const { db, json, verifyClient } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { clientId, deviceId } = JSON.parse(event.body || '{}');
  if (!(await verifyClient(clientId, deviceId))) return json(403, { error: 'Not signed in' });

  const { data: client } = await db.from('clients').select('id, name, producer_id').eq('id', clientId).single();
  const { data: producer } = client
    ? await db.from('producers').select('name').eq('id', client.producer_id).maybeSingle()
    : { data: null };
  const { data: animals } = await db
    .from('animals')
    .select('id, tag, target_lb, status, ship_date, ship_lb, weighins(weigh_date, weight_lb, notes)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });

  const shaped = (animals || []).map((a) => ({
    id: a.id,
    tag: a.tag,
    targetLb: a.target_lb,
    status: a.status,
    shipDate: a.ship_date,
    shipLb: a.ship_lb,
    weighins: (a.weighins || [])
      .sort((x, y) => x.weigh_date.localeCompare(y.weigh_date))
      .map((w) => [w.weigh_date, w.weight_lb, w.notes || ''])
  }));

  return json(200, { client, producerName: producer && producer.name, animals: shaped });
};
