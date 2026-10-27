// POST { producerId, deviceId, reviewId }
// A held weight on a shipped tag starts a new animal. The shipped record stays shipped.
const { db, json, verifyProducer, parseTag } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { producerId, deviceId, reviewId } = JSON.parse(event.body || '{}');
  if (!(await verifyProducer(producerId, deviceId))) return json(403, { error: 'Not signed in' });

  const { data: row } = await db.from('review_queue').select('*').eq('id', reviewId).eq('producer_id', producerId).maybeSingle();
  if (!row) return json(404, { error: 'Not found' });

  const tag = parseTag(row.tag) || String(row.tag || '').trim();
  const { data: active } = await db.from('animals').select('id, tag')
    .eq('client_id', row.client_id).eq('status', 'active');
  if ((active || []).some((a) => parseTag(a.tag) === tag)) {
    return json(409, { error: 'Tag ' + tag + ' is already active on this client.' });
  }
  const { data: created, error } = await db.from('animals')
    .insert({ producer_id: producerId, client_id: row.client_id, tag, target_lb: 1500, status: 'active' })
    .select('id').single();
  if (error) {
    if (error.code === '23505') return json(409, { error: 'Tag ' + tag + ' is already active on this client.' });
    return json(500, { error: 'Could not create animal' });
  }
  const { error: weighErr } = await db.from('weighins').insert({ animal_id: created.id, weigh_date: row.weigh_date, weight_lb: row.weight_lb });
  if (weighErr) return json(500, { error: 'Could not save the weigh-in' });
  await db.from('review_queue').delete().eq('id', reviewId);
  return json(200, { ok: true });
};
