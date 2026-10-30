// POST { producerId, deviceId, animalId, action, confirm?, tag?, date?, weight?, notes?, previousDate?, reopen?, newAnimal? }
// action: rename | delete | delete-weigh | save-weigh
// Clients never call this. Destructive actions require confirm:true.
const { db, json, verifyProducer, parseIsoDate, parseWeight, parseTag } = require('./lib/db');

async function loadAnimal(producerId, animalId) {
  const { data } = await db.from('animals')
    .select('id, client_id, tag, status, ship_date, producer_id')
    .eq('id', animalId).eq('producer_id', producerId).maybeSingle();
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const body = JSON.parse(event.body || '{}');
  const { producerId, deviceId, animalId, action } = body;
  if (!(await verifyProducer(producerId, deviceId))) return json(403, { error: 'Not signed in' });
  const animal = await loadAnimal(producerId, animalId);
  if (!animal) return json(404, { error: 'Animal not found' });

  if (action === 'rename') {
    const tag = parseTag(body.tag);
    if (!tag) return json(400, { error: 'Enter the tag as a number.' });
    const { data: others } = await db.from('animals').select('id, tag, status')
      .eq('client_id', animal.client_id).eq('status', 'active').neq('id', animal.id);
    const clash = animal.status === 'active' && (others || []).find((a) => parseTag(a.tag) === tag);
    if (clash) return json(409, { error: 'Tag ' + tag + ' is already active on this client.' });
    const { error } = await db.from('animals').update({ tag }).eq('id', animal.id);
    if (error) {
      if (error.code === '23505') return json(409, { error: 'Tag ' + tag + ' is already active on this client.' });
      return json(500, { error: 'Could not rename the tag' });
    }
    return json(200, { ok: true, tag });
  }

  if (action === 'delete') {
    if (body.confirm !== true) return json(400, { error: 'Confirm the removal first.' });
    await db.from('review_queue').delete().eq('prior_animal_id', animal.id);
    const { error } = await db.from('animals').delete().eq('id', animal.id).eq('producer_id', producerId);
    if (error) return json(500, { error: 'Could not remove the animal' });
    return json(200, { ok: true });
  }

  if (action === 'delete-weigh') {
    if (body.confirm !== true) return json(400, { error: 'Confirm the removal first.' });
    const date = parseIsoDate(body.date);
    if (!date) return json(400, { error: 'Pick a real date. Future dates are not saved.' });
    const { error } = await db.from('weighins').delete().eq('animal_id', animal.id).eq('weigh_date', date);
    if (error) return json(500, { error: 'Could not remove that weigh-in' });
    return json(200, { ok: true });
  }

  if (action === 'save-weigh') {
    const date = parseIsoDate(body.date);
    const weight = parseWeight(body.weight);
    const notes = String(body.notes == null ? '' : body.notes).replace(/\s+/g, ' ').trim();
    if (!date) return json(400, { error: 'Pick a real date. Future dates are not saved.' });
    if (weight == null) return json(400, { error: 'Enter a whole number of pounds.' });
    if (notes.length > 200) return json(400, { error: 'Keep the note to 200 characters.' });
    const previousDate = body.previousDate ? parseIsoDate(body.previousDate) : null;
    if (body.previousDate && !previousDate) return json(400, { error: 'Pick a real date. Future dates are not saved.' });

    const freshAfterShip = animal.status === 'shipped' && animal.ship_date && date > animal.ship_date && !previousDate;

    let targetId = animal.id;
    if (freshAfterShip) {
      const tag = parseTag(animal.tag) || animal.tag;
      const { data: active } = await db.from('animals').select('id, tag')
        .eq('client_id', animal.client_id).eq('status', 'active');
      if ((active || []).some((a) => parseTag(a.tag) === tag)) {
        return json(409, { error: 'Tag ' + tag + ' is already active on this client.' });
      }
      const { data: created, error } = await db.from('animals')
        .insert({ producer_id: producerId, client_id: animal.client_id, tag, target_lb: 1500, status: 'active' })
        .select('id').single();
      if (error) {
        if (error.code === '23505') return json(409, { error: 'Tag ' + tag + ' is already active on this client.' });
        return json(500, { error: 'Could not add the new animal' });
      }
      targetId = created.id;
    }

    if (previousDate && previousDate !== date && !body.newAnimal) {
      const { data: clash } = await db.from('weighins').select('id')
        .eq('animal_id', targetId).eq('weigh_date', date).maybeSingle();
      if (clash) return json(409, { error: 'This animal already has a weight on that date. Change that one, or remove it first.' });
      const { data: updated, error } = await db.from('weighins')
        .update({ weigh_date: date, weight_lb: weight, notes })
        .eq('animal_id', targetId).eq('weigh_date', previousDate).select('id');
      if (error || !updated || !updated.length) return json(404, { error: 'That weigh-in was not found.' });
      return json(200, { ok: true });
    }

    if (!previousDate || body.newAnimal) {
      const { data: clash } = await db.from('weighins').select('id')
        .eq('animal_id', targetId).eq('weigh_date', date).maybeSingle();
      if (clash) return json(409, { error: 'This animal already has a weight on that date. Change that one, or remove it first.' });
      const { error } = await db.from('weighins').insert({ animal_id: targetId, weigh_date: date, weight_lb: weight, notes });
      if (error) return json(500, { error: 'Could not save the weigh-in' });
      return json(200, { ok: true, animalId: targetId });
    }

    const { error } = await db.from('weighins').update({ weight_lb: weight, notes })
      .eq('animal_id', targetId).eq('weigh_date', date);
    if (error) return json(500, { error: 'Could not save the weigh-in' });
    return json(200, { ok: true });
  }

  return json(400, { error: 'Unknown action' });
};
