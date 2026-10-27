// POST { secret, name, email }  ->  { producer: {id, name, code} }
// Owner-only. Requires ADMIN_SECRET (set this yourself in Netlify env vars,
// pick any long random string — it's not the Supabase key). No UI reads or
// stores this secret; you type it each time in admin.html.
const { db, json, makeCode } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { secret, name, email } = JSON.parse(event.body || '{}');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return json(403, { error: 'Wrong secret' });
  }
  if (!name || !email) return json(400, { error: 'Name and email required' });

  let code;
  for (let tries = 0; tries < 5; tries++) {
    code = makeCode(8);
    const { data: clash } = await db.from('producers').select('id').eq('code', code).maybeSingle();
    if (!clash) break;
  }

  const { data: producer, error } = await db
    .from('producers')
    .insert({ name, email, code })
    .select('id, name, code')
    .single();
  if (error) return json(500, { error: 'Could not create producer' });
  return json(200, { producer });
};
