// Scheduled function — runs automatically, nobody needs to visit the site.
// Supabase's free tier pauses a project after 7 days with no activity;
// this does one tiny read every day so that never happens.
const { db } = require('./lib/db');

exports.handler = async () => {
  const { error } = await db.from('producers').select('id').limit(1);
  if (error) {
    console.error('keep-alive failed', error.message);
    return { statusCode: 500, body: 'keep-alive failed' };
  }
  return { statusCode: 200, body: 'ok' };
};

exports.config = {
  schedule: '@daily'
};
