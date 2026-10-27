// POST { producerId, deviceId, clientId, date, entries: [
//   { animalId, weight } |
//   { tag, weight, same?: boolean, priorAnimalId?: string }
// ] }
// One date for the whole list. The same animal and date overwrites pounds.
// A tag that matches an active animal updates that animal.
// Two active animals on one client cannot share a tag. Another client may use it.
// A shipped tag used on a later date starts a new animal. The shipped record stays shipped.
// A date on or before the ship date is history on that shipped animal.
const { db, json, verifyProducer, clientBelongsToProducer, parseIsoDate, parseWeight, parseTag } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { producerId, deviceId, clientId, date, entries } = JSON.parse(event.body || '{}');
  if (!(await verifyProducer(producerId, deviceId))) return json(403, { error: 'Not signed in' });
  if (!(await clientBelongsToProducer(clientId, producerId))) return json(404, { error: 'Client not found' });
  const weighDate = parseIsoDate(date);
  if (!weighDate) return json(400, { error: 'Pick a real date. Future dates are not saved.' });
  if (!Array.isArray(entries) || !entries.length) return json(400, { error: 'Enter at least one weight.' });

  const { data: animals, error: loadErr } = await db
    .from('animals')
    .select('id, tag, status, ship_date')
    .eq('client_id', clientId)
    .eq('producer_id', producerId);
  if (loadErr) return json(500, { error: 'Could not load animals' });
  const byId = {};
  (animals || []).forEach((a) => { byId[a.id] = a; });

  const planned = [];
  const createTags = [];
  const queueCreate = (tag, weight) => {
    const row = createTags.find((t) => t.tag === tag);
    if (row) row.weight = weight;
    else createTags.push({ tag, weight });
  };

  for (const entry of entries) {
    const weight = parseWeight(entry.weight);
    if (weight == null) return json(400, { error: 'Enter a whole number of pounds from 50 to 5,000.' });

    let animal = entry.animalId ? byId[entry.animalId] : null;
    if (entry.animalId && !animal) return json(404, { error: 'Animal not found' });

    if (!animal) {
      const tag = parseTag(entry.tag);
      if (!tag) return json(400, { error: 'Enter the tag as a number.' });
      const matches = (animals || []).filter((a) => parseTag(a.tag) === tag);
      const active = matches.find((a) => a.status === 'active');
      const shipped = matches.filter((a) => a.status === 'shipped')
        .sort((a, b) => (b.ship_date || '').localeCompare(a.ship_date || ''))[0];
      if (active) animal = active;
      else if (shipped && weighDate > shipped.ship_date) { queueCreate(tag, weight); continue; }
      else if (shipped) animal = shipped;
      else queueCreate(tag, weight);
    }

    if (animal && animal.status === 'shipped' && weighDate > animal.ship_date) {
      queueCreate(parseTag(animal.tag) || animal.tag, weight);
    } else if (animal) {
      planned.push({ animal, weight });
    }
  }

  const seen = new Set();
  const weighRows = [];
  for (const p of planned) {
    if (seen.has(p.animal.id)) {
      const row = weighRows.find((r) => r.animal_id === p.animal.id);
      if (row) row.weight_lb = p.weight;
    } else {
      seen.add(p.animal.id);
      weighRows.push({ animal_id: p.animal.id, weigh_date: weighDate, weight_lb: p.weight });
    }
  }

  let created = 0;
  if (createTags.length) {
    const { data: inserted, error } = await db.from('animals')
      .insert(createTags.map((t) => ({
        producer_id: producerId, client_id: clientId, tag: t.tag, target_lb: 1500, status: 'active'
      })))
      .select('id, tag');
    if (error) {
      if (error.code === '23505') return json(409, { error: 'That tag number is already active on this client.' });
      return json(500, { error: 'Could not add the new animals' });
    }
    created = inserted.length;
    const byTag = {};
    inserted.forEach((a) => { (byTag[a.tag] = byTag[a.tag] || []).push(a.id); });
    const used = {};
    for (const t of createTags) {
      const ids = byTag[t.tag] || [];
      const n = used[t.tag] || 0;
      const id = ids[n];
      used[t.tag] = n + 1;
      if (id) weighRows.push({ animal_id: id, weigh_date: weighDate, weight_lb: t.weight });
    }
  }

  const toWrite = weighRows.map((r) => ({ animal_id: r.animal_id, weigh_date: r.weigh_date, weight_lb: r.weight_lb }));
  if (!toWrite.length) return json(400, { error: 'Enter at least one weight.' });

  const ids = [...new Set(toWrite.map((r) => r.animal_id))];
  const { data: existing } = await db.from('weighins').select('animal_id, weight_lb')
    .eq('weigh_date', weighDate).in('animal_id', ids);
  const had = {};
  (existing || []).forEach((w) => { had[w.animal_id] = w.weight_lb; });

  // ignoreDuplicates stays off so a corrected weight replaces the old one.
  const { error } = await db.from('weighins').upsert(toWrite, { onConflict: 'animal_id,weigh_date', ignoreDuplicates: false });
  if (error) return json(500, { error: 'Could not save weigh-ins' });

  let updated = 0, saved = 0;
  toWrite.forEach((r) => { if (had[r.animal_id] != null) updated++; else saved++; });
  return json(200, { saved, updated, created });
};
