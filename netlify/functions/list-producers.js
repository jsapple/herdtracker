// POST { secret }  ->  { producers: [{id, name, email, status}] }
const { db, json, adminOk } = require('./lib/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const { secret } = JSON.parse(event.body || '{}');
  if (!adminOk(secret)) return json(403, { error: 'Wrong secret' });

  const { data, error } = await db
    .from('producers')
    .select('id, name, email, status')
    .order('name');
  if (error) return json(500, { error: 'Could not load producers' });
  return json(200, { producers: data || [] });
};
