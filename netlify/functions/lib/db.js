// Shared Supabase admin client. Uses the service role key, which bypasses
// row-level security — that's fine here because these functions only ever
// run on Netlify's servers, never in the browser.
const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const json = (status, body) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
function makeCode(len) {
  let c = '';
  for (let i = 0; i < len; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

module.exports = { db, json, makeCode };

// Confirms a producerId + deviceId pair is actually linked, before letting
// that request touch anything. Every producer-scoped function calls this
// first — a request can't just claim a producerId, it has to prove it with
// a device that was actually linked by producer-login.
function adminOk(secret) {
  return !!(process.env.ADMIN_SECRET && secret === process.env.ADMIN_SECRET);
}
module.exports.adminOk = adminOk;

async function verifyProducer(producerId, deviceId) {
  if (!producerId || !deviceId) return false;
  const { data: producer } = await db
    .from('producers')
    .select('status')
    .eq('id', producerId)
    .maybeSingle();
  if (!producer || producer.status !== 'active') return false;
  const { data } = await db
    .from('producer_devices')
    .select('device_id')
    .eq('producer_id', producerId)
    .eq('device_id', deviceId)
    .maybeSingle();
  return !!data;
}

module.exports.verifyProducer = verifyProducer;

async function verifyClient(clientId, deviceId) {
  if (!clientId || !deviceId) return false;
  const { data } = await db
    .from('client_devices')
    .select('device_id')
    .eq('client_id', clientId)
    .eq('device_id', deviceId)
    .maybeSingle();
  return !!data;
}
module.exports.verifyClient = verifyClient;

// Confirms a client belongs to the given producer (used when a producer
// views/edits one of their clients — prevents touching another producer's data).
async function clientBelongsToProducer(clientId, producerId) {
  const { data } = await db
    .from('clients').select('id').eq('id', clientId).eq('producer_id', producerId).maybeSingle();
  return !!data;
}
module.exports.clientBelongsToProducer = clientBelongsToProducer;

// Calendar date as YYYY-MM-DD. Rejects impossible days and anything more
// than one day past UTC, which covers a timezone skew without allowing a
// date that is plainly in the future.
function parseIsoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 2000) return null;
  const max = new Date();
  max.setUTCDate(max.getUTCDate() + 1);
  if (s > max.toISOString().slice(0, 10)) return null;
  return s;
}

// Whole pounds. Commas are allowed ("1,450"). Decimals are refused.
function parseWeight(v) {
  const s = String(v == null ? '' : v).trim().replace(/,/g, '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!n) return null;
  return n;
}

// Tag numbers are digits. "012" and "12" are the same tag. Letters are refused.
function parseTag(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = s.replace(/^0+(?=\d)/, '');
  if (!n || n.length > 12) return null;
  return n;
}

module.exports.parseIsoDate = parseIsoDate;
module.exports.parseWeight = parseWeight;
module.exports.parseTag = parseTag;
