const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
const attr = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };

const dev = ls('ht_dev') || (() => { const d = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); ls('ht_dev', d); return d; })();

const S = {
  view: 'l', role: null, id: null, data: null, cur: null, fails: 0,
  mode: null, sel: [], rc: false, rm: false, ra: null, sh: false, busy: false,
  weighDate: null, draft: {}, newRows: [], hist: null,
  q: '', wq: '', cut: null, del: null, skipCapture: false
};

let mt; const msg = (t) => { $('#msg').textContent = t; clearTimeout(mt); if (t) mt = setTimeout(() => msg(''), 7000); };

async function api(path, body) {
  try {
    const r = await fetch('/.netlify/functions/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, d };
  } catch (e) {
    return { ok: false, status: 0, d: { error: 'Could not reach the server. Check your connection.' } };
  }
}

function fmt(iso, year) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const opts = { month: 'short', day: 'numeric' };
  if (year !== false && y !== new Date().getFullYear()) opts.year = 'numeric';
  return dt.toLocaleDateString(undefined, opts);
}
function fmtStamp(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return fmt(String(s).slice(0, 10));
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function ago(n) {
  if (n == null || Number.isNaN(n)) return '';
  if (n < 0) return 'dated ahead';
  if (n === 0) return 'today';
  if (n === 1) return '1 day ago';
  return n + ' days ago';
}
const today = () => HerdStats.localToday();
const st = (a) => HerdStats.animalStats(a, today());
const grp = (list) => HerdStats.groupStats(list, today());
const tagNum = (raw) => {
  const s = String(raw == null ? '' : raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = s.replace(/^0+(?=\d)/, '');
  return n && n.length <= 12 ? n : null;
};
const tagSort = (a, b) => String(a.tag).localeCompare(String(b.tag), undefined, { numeric: true, sensitivity: 'base' });
function gainSort(a, b) {
  const av = st(a).adg == null ? Infinity : st(a).adg;
  const bv = st(b).adg == null ? Infinity : st(b).adg;
  if (av !== bv) return av - bv;
  return tagSort(a, b);
}
function chart(animals) {
  const ser = HerdStats.chartSeries(animals);
  if (ser.length < 2) {
    return `<p class=mu>${ser.length ? 'Another weigh-in will show the trend.' : 'Enter weights to see the trend.'}</p>`;
  }
  const W = 320, H = 140, P = 36;
  const xs = ser.map((s) => Date.parse(s[0])), ys = ser.map((s) => s[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 8, y1 = Math.max(...ys) + 8;
  const X = (t) => P + (t - x0) / (x1 - x0 || 1) * (W - P - 6);
  const Y = (v) => H - 20 - (v - y0) / (y1 - y0 || 1) * (H - 34);
  const pts = ser.map((s) => X(Date.parse(s[0])).toFixed(1) + ',' + Y(s[1]).toFixed(1)).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Average weight over time"><polyline class="l" points="${pts}"/><text class="t" x="${P}" y="${H - 4}">${fmt(ser[0][0])}</text><text class="t" x="${W - 6}" y="${H - 4}" text-anchor="end">${fmt(ser[ser.length - 1][0])}</text><text class="t" x="0" y="12">${Math.round(y1)}</text><text class="t" x="0" y="${H - 22}">${Math.round(y0)}</text></svg>`;
}

function band(h, a, g) {
  const avg = a == null ? '—' : Math.round(a);
  const gain = g == null ? '—' : Number(g).toFixed(2);
  return `<div class=band><div><b>${h}</b>head</div><div><b>${gain}</b>lb per day</div><div><b>${avg}</b>avg lb</div></div>`;
}

function activeOf(clientId) { return S.data.animals.filter((a) => a.clientId === clientId && a.status === 'active'); }
function shippedOf(clientId) { return S.data.animals.filter((a) => a.clientId === clientId && a.status === 'shipped'); }
function allActive() { return S.data.animals.filter((a) => a.status === 'active'); }
function clientOf(id) { return S.data.clients.find((c) => c.id === id); }
function animalById(id) { return S.data.animals.find((a) => a.id === id); }
function clientsSorted() {
  return S.data.clients.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

// ───────────────────────────── views ─────────────────────────────

const loginV = () => `
<div class="card c"><h2>Sign in</h2>
<p class=mu>Enter the code you were sent. A client code is 6 characters. A producer code is 8.</p>
<input id=code maxlength=8 autocomplete=off autocapitalize=characters placeholder="CODE" onkeydown="if(event.key==='Enter')login()">
<button class=bt onclick="login()">Continue</button>
<p class=mu>On an iPhone, Share, then Add to Home Screen.</p></div>`;

function deviceRows(list, scope, clientId) {
  if (!list || !list.length) return '<p class=mu>No devices linked yet.</p>';
  return list.map((d) => {
    const mine = d.deviceId === dev;
    const key = scope + ':' + (clientId || '') + ':' + d.deviceId;
    const confirm = S.cut === key;
    return `<div class=row><div>${mine && scope === 'producer' ? 'This device' : 'Other device'}<br><span class=mu>Linked ${fmtStamp(d.linkedAt)}</span></div><button type=button class="mini${confirm ? ' bad' : ''}" onclick="removeDevice('${scope}','${clientId || ''}','${d.deviceId}')">${confirm ? 'Confirm remove' : 'Remove'}</button></div>`;
  }).join('');
}
function deviceCard(scope, list, clientId) {
  const n = (list || []).length;
  const title = scope === 'producer' ? `Your devices · ${n} of 4` : `Client devices · ${n} of 4`;
  return `<details class=card><summary>${title}</summary>${deviceRows(list, scope, clientId)}<p class=mu>Signing out leaves the device linked. Remove an old phone here.</p></details>`;
}

function reviewV() {
  if (!S.data.review || !S.data.review.length) return '';
  return `<div class=card><div class=hd>Needs review</div>${S.data.review.map((r) => `<div class=an><b>${esc(r.tag)}</b><p class=mu>Shipped ${fmt(r.ship_date || r.weigh_date)}. A weight of ${r.weight_lb} lb on ${fmt(r.weigh_date)} starts a new animal. The shipped record stays as history.</p><div class=cb style="margin:8px 0 0"><button type=button class=cf2 onclick="resolveReview('${r.id}')">Add as new animal</button></div></div>`).join('')}</div>`;
}

function prodV() {
  const clients = clientsSorted();
  const head = allActive().length;
  const list = clients.length ? `<div class=card>${clients.map((c) => {
    const g = grp(activeOf(c.id));
    const avg = g.avg == null ? '—' : Math.round(g.avg);
    const adg = g.adg == null ? '—' : g.adg.toFixed(2);
    const slow = g.slower.length ? `<br><span class=wa>${g.slower.length} gaining slower</span>` : '';
    return `<div class="row go" onclick="openClient('${c.id}')"><div><b>${esc(c.name)}</b><br><span class=mu>${g.head} head · ${avg} lb</span></div><div class=rt>${adg} <small>lb/day</small>${slow}</div></div>`;
  }).join('')}</div>` : '<div class=card><p class=mu>Add a client, then enter weights.</p></div>';
  return `<h2>All clients</h2>
${parkNote()}
<div class=band><div><b>${head}</b>head</div><div><b>${clients.length}</b>clients</div></div>
${reviewV()}${list}
${deviceCard('producer', S.data.devices || [], '')}
<div class=card><div class=hd>Add a client</div><input id=nn placeholder="Client name" onkeydown="if(event.key==='Enter')addClient()"><button class=bt onclick="addClient()">Add client and make code</button></div>
${pageTools('producer')}`;
}

function finishBlock(s) {
  if (s.wt == null) return '';
  const days = s.days === 1 ? '1 day' : s.days + ' days';
  if (s.atTarget) return '<div class="fin ok">On Target</div>';
  if (s.finish) return `<div class=fin>${s.toGo} lb left · ${days}<small>estimated on ${fmt(s.finish, false)}</small></div>`;
  if (s.estimateNote === 'low') return `<div class=fin>${s.toGo} lb left<small>gain too low to date</small></div>`;
  return `<div class=fin>${s.toGo} lb left<small>weigh again to date</small></div>`;
}
function targetControls(a) {
  return `<div class=tg><input inputmode=numeric value="${a.targetLb}" onchange="setTargetInput('${a.id}',this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}" aria-label="Target weight in pounds"></div>`;
}
function animalV(a, g, selecting) {
  const s = st(a);
  const on = S.sel.includes(a.id);
  const pct = s.wt == null || !a.targetLb ? 0 : Math.min(100, s.wt / a.targetLb * 100);
  const slow = g.slower.includes(a.id);
  return `<div class=an data-tag="${attr(a.tag)}" data-id="${a.id}"${selecting ? ` onclick="toggleSel('${a.id}')"` : ''}>
<div class=l1><b>${selecting ? `<span class="ck${on ? ' on' : ''}"></span>` : ''}${esc(a.tag)}</b><b>${s.wt == null ? '—' : s.wt + ' lb'}</b></div>
${s.date ? `<p class="mu above">weight on ${fmt(s.date)} · ${ago(s.since)}</p>` : '<p class="mu above">No weight yet</p>'}
<div class="pb${s.atTarget ? ' ok' : ''}"><i style="width:${pct.toFixed(0)}%"></i></div>
${selecting ? finishBlock(s) : `<div class=aim>${targetControls(a)}${finishBlock(s)}</div>`}
${slow ? '<p class=slow>gaining slower than this group</p>' : ''}
${selecting ? '' : `<div class=past><button type=button class=mini onclick="openHist('${a.id}')">Past Weights</button></div>`}
</div>`;
}

function typicalV(g) {
  const typical = g.typical ? fmt(g.typical, false) : '—';
  const early = g.earliest ? fmt(g.earliest, false) : '—';
  const late = g.latest ? fmt(g.latest, false) : '—';
  return `<div class="band fin"><div><b>${typical}</b>typical</div><div><b>${early}</b>earliest</div><div><b>${late}</b>latest</div></div>`;
}

function shipV(clientId, p) {
  const L = shippedOf(clientId);
  if (!L.length) return '';
  const G = {};
  L.forEach((a) => { (G[a.shipDate] = G[a.shipDate] || []).push(a); });
  const inf = (a) => {
    const w = a.weighins[0];
    if (!w || a.shipLb == null) return null;
    const g = a.shipLb - w[1];
    const dy = Math.max(1, HerdStats.daysBetween(w[0], a.shipDate));
    return { i: w[1], g, dy, adg: g / dy };
  };
  return `<details class=card ${S.sh ? 'open' : ''} ontoggle="S.sh=this.open"><summary>Shipped · ${L.length} head</summary>${Object.keys(G).sort().reverse().map((d) => {
    const l = G[d];
    const known = l.map(inf).filter(Boolean);
    const avg = (k) => known.length ? known.reduce((s, x) => s + x[k], 0) / known.length : 0;
    const head = known.length ? `<span>avg +${Math.round(avg('g'))} lb · ${avg('adg').toFixed(2)} lb/day · ${Math.round(avg('dy'))} days</span>` : '';
    return `<div class=gh><b>Shipped ${fmt(d)} · ${l.length} head</b>${head}</div>` + l.map((a) => {
      const x = inf(a);
      const line = x ? `In ${x.i} → Out ${a.shipLb} lb` : 'No in-weight';
      const side = x ? `+${x.g} lb<br><small>${x.adg.toFixed(2)}/day · ${x.dy} days</small>` : '';
      return `<div class=row><div>${esc(a.tag)}<br><span class=mu>${line}</span></div><div class=rt>${side}${p ? `<br><button type=button class="sm${S.ra === a.id ? ' cfm' : ''}" onclick="reactivate('${a.id}')">${S.ra === a.id ? 'Confirm reactivate' : 'Reactivate'}</button>` : ''}<br><button type=button class=mini onclick="openHist('${a.id}')">Past Weights</button></div></div>`;
    }).join('');
  }).join('')}</details>`;
}

function clientMain(id, g, p) {
  const selecting = S.mode === 'sel';
  const animals = activeOf(id).slice().sort(gainSort);
  const actions = p && !selecting
    ? `<div class=act>${!S.mode && animals.length ? '<button type=button class=ship onclick="startShip()">Ship</button>' : ''}<button type=button class=weigh onclick="startWeigh()">Weigh</button></div>`
    : '';
  return `${band(g.head, g.avg, g.adg)}
${typicalV(g)}
<div class=card><div class=hd>Average weight</div>${chart(activeOf(id))}</div>
<div class=card>
${actions}
${selecting ? '<p class=mu>Tap each animal that went on the truck.</p>' : ''}
<input id=q inputmode=numeric placeholder="Find a tag" value="${attr(S.q)}" oninput="filterTags(this.value)" autocomplete=off aria-label="Find a tag">
<div id=herd>${animals.map((a) => animalV(a, g, selecting)).join('') || `<p class=mu>${p ? 'No active animals. Tap Weigh, then Add a tag.' : 'No active animals.'}</p>`}</div>
${selecting ? `<div class=sb><button type=button class=sm onclick="S.mode=null;S.sel=[];draw()">Cancel</button><button type=button class=bt2 ${S.sel.length ? '' : 'disabled'} onclick="S.mode='conf';draw()">Ship ${S.sel.length}</button></div>` : ''}
</div>
${shipV(id, p)}
${selecting ? '' : pageTools(p ? 'producer' : 'client', id)}`;
}

function weightOn(a, date) {
  const hit = (a.weighins || []).find((w) => w[0] === date);
  return hit ? String(hit[1]) : '';
}
function weighV(clientId) {
  const date = S.weighDate || today();
  S.weighDate = date;
  const q = (S.wq || '').trim();
  const animals = activeOf(clientId).slice().sort(tagSort);
  const rows = animals.map((a) => {
    const val = Object.prototype.hasOwnProperty.call(S.draft, a.id) ? S.draft[a.id] : weightOn(a, date);
    const hide = q && String(a.tag).indexOf(q) === -1;
    return `<div class="row wrow" data-tag="${attr(a.tag)}"${hide ? ' hidden' : ''}><div class=wtag>${esc(a.tag)}</div><input data-wid="${a.id}" inputmode=numeric enterkeyhint=next autocomplete=off placeholder="lb" aria-label="Weight in pounds for ${attr(a.tag)}" value="${attr(val)}" oninput="S.draft[this.dataset.wid]=this.value;parkWeigh()" onkeydown="if(event.key==='Enter'){event.preventDefault();nextEmpty(this)}"></div>`;
  }).join('') || '<p class=mu>No animals yet. Add a tag below.</p>';
  const waiting = parkedFor(clientId) ? '<p class=mu>Saved on this phone, waiting for signal.</p>' : '';
  return `<button type=button class=lk onclick="backToList()">‹ Back</button>
<div class=card><div class=hd>Weigh date</div>
<input type=date id=wd value="${date}" onchange="setWeighDate(this.value)">
${waiting}
${rows}
<div class="sb sit"><button type=button class=sm onclick="backToList()">Back</button><button type=button class=bt2 id=savew onclick="saveWeigh('${clientId}')">Save weights</button></div>
</div>
<div class=card><div class=hd>Add a tag</div>
<input id=newtag inputmode=numeric enterkeyhint=done placeholder="input tag number" autocomplete=off aria-label="New tag" onkeydown="if(event.key==='Enter'){event.preventDefault();saveTag('${clientId}')}">
<button type=button class=sm2 style="width:100%" onclick="saveTag('${clientId}')">Save tag</button>
</div>`;
}

function histV(id) {
  const a = animalById(id);
  if (!a) return '<button type=button class=lk onclick="backToList()">‹ Back</button><p class=mu>That animal is gone.</p>';
  const p = S.role === 'producer';
  const w = (a.weighins || []).slice().sort((x, y) => x[0].localeCompare(y[0]));
  const rows = w.map(([date, weight]) => {
    if (!p) return `<div class=row><div>${fmt(date)}</div><div class=rt>${weight} lb</div></div>`;
    const key = 'w:' + a.id + ':' + date;
    return `<div class=row data-prev="${date}" style="flex-wrap:wrap"><div class=pair style="flex:1"><input type=date class=hdte value="${date}" aria-label="Weigh date for ${attr(a.tag)}"><input class=hwt inputmode=numeric value="${weight}" aria-label="Pounds" style="flex:none;width:110px"></div><button type=button class=mini onclick="saveHistRow('${a.id}', this)">Save</button><button type=button class="mini bad" onclick="deleteWeigh('${a.id}','${date}')">${S.del === key ? 'Confirm remove' : 'Remove'}</button></div>`;
  }).join('') || '<p class=mu>No weights yet.</p>';
  const edit = p ? `<div class=hd style="margin-top:16px">Tag</div><div class=pair><input id=tagname inputmode=numeric value="${attr(a.tag)}" aria-label="Tag"><button type=button class=mini onclick="renameAnimal('${a.id}')">Save tag</button></div><div class=hd style="margin-top:16px">Add a weigh-in</div><p class=mu>Pick the date this weight was taken. Change it for an earlier weigh-in. A date after this animal shipped starts a new animal and leaves this record as history.</p><div class=pair><input type=date id=ad value="${today()}" aria-label="Date for the new weigh-in"><input id=aw inputmode=numeric placeholder="lb" aria-label="Pounds" style="flex:none;width:110px"></div><button type=button class=bt onclick="addHistWeigh('${a.id}')">Add weigh-in</button><button type=button class="mini bad" style="margin-top:16px" onclick="deleteAnimal('${a.id}')">${S.del === 'a:' + a.id ? 'Confirm remove animal' : 'Remove animal'}</button>` : '';
  return `<button type=button class=lk onclick="backToList()">‹ Back</button><h2>${esc(a.tag)}</h2><div class=card><div class=hd>Past Weights</div>${rows}${edit}</div>`;
}

function confV(id) {
  const L = activeOf(id).filter((a) => S.sel.includes(a.id));
  return `<div class=card><div class=hd>Confirm shipment · ${L.length} head</div><p class="mu" style="margin:0">Ship date</p><input type=date id=sd value="${today()}"><p class=mu>Filled in as today. Change it if the truck left on another day.</p><p class=mu>Ship weight starts at the last weigh-in. Change it if you have a load-out weight.</p>${L.map((a) => {
    const s = st(a);
    return `<div class=row data-id="${a.id}"><div>${esc(a.tag)}</div><input class=sw type=text inputmode=numeric value="${s.wt == null ? '' : s.wt}" aria-label="Ship weight for ${attr(a.tag)}" style="width:120px;margin:0;flex:none;text-align:center"></div>`;
  }).join('')}<div class=cb style="margin:16px 0 0"><button type=button onclick="S.mode='sel';draw()">Back</button><button type=button class=cf2 onclick="confirmShip('${id}')">Confirm shipment</button></div></div>`;
}

function clientV(id) {
  const c = clientOf(id);
  if (!c) return '<p class=mu>That client is gone.</p>';
  const p = S.role === 'producer';
  const g = grp(activeOf(id));
  const crumb = p && !S.mode ? '<button type=button class=lk onclick="backToClients()">‹ All clients</button>' : '';
  const head = `<h2>${esc(c.name)}</h2>`;
  const code = p && !S.mode ? `<p class=mu>Client code <b>${esc(c.code)}</b> · ${(c.devices || []).length} of 4 devices</p><div class=cb><button type=button onclick="shareCode('${esc(c.code)}')">Share code</button><button type=button class="${S.rc ? 'cf' : ''}" onclick="reissueCode('${id}')">${S.rc ? 'Confirm reissue' : 'Reissue code'}</button></div>${deviceCard('client', c.devices || [], id)}` : '';
  const waiting = p && !S.mode && parkedFor(id) ? parkNote() : '';
  let body;
  if (S.mode === 'weigh' && p) body = weighV(id);
  else if (S.mode === 'hist') body = histV(S.hist);
  else if (S.mode === 'conf' && p) body = confV(id);
  else body = clientMain(id, g, p);
  return crumb + (S.mode === 'hist' ? '' : head) + code + waiting + body;
}

function draw() {
  if (S.mode === 'weigh' && !S.skipCapture) captureWeigh();
  S.skipCapture = false;
  if (S.view !== 'c') { S.mode = null; S.sel = []; S.ra = null; S.rm = false; S.rc = false; }
  if (S.view !== 'l' && !S.data) S.view = 'l';
  $('#app').innerHTML = S.view === 'l' ? loginV() : S.view === 'p' ? prodV() : clientV(S.cur);
  if (S.view !== 'l' && S.mode !== 'weigh' && S.mode !== 'hist' && S.mode !== 'sel' && S.mode !== 'conf') $('#app').insertAdjacentHTML('beforeend', '<button type="button" class="signout" onclick="signOut()">Sign out</button>');
  if (S.view === 'c' && S.role === 'producer' && !S.mode && clientOf(S.cur)) $('#app').insertAdjacentHTML('beforeend', `<button type="button" class="rm${S.rm ? ' on' : ''}" onclick="removeClient('${S.cur}')">${S.rm ? 'Confirm remove client' : 'Remove client'}</button>${S.rm ? '<p class=mu>This deletes the client, their cattle, and their weights. It cannot be undone.</p>' : ''}`);
  const top = document.getElementById('top');
  if (top) top.hidden = S.view !== 'l';
  if (S.q && document.getElementById('q')) filterTags(S.q);
  stayAwake(S.role === 'producer' && S.view !== 'l');
}

function filterTags(v) {
  S.q = v;
  document.querySelectorAll('#herd [data-tag]').forEach((el) => {
    const tag = (el.getAttribute('data-tag') || '').toLowerCase();
    el.hidden = !!(S.q && tag.indexOf(S.q.trim().toLowerCase()) === -1);
  });
}

// ───────────────────────────── actions ─────────────────────────────

async function login() {
  if (S.fails >= 5) return msg('Too many tries. Wait and try again, or ask for a new code.');
  const code = $('#code').value.trim().toUpperCase();
  if (code.length === 8) { stayAwake(true); return producerLogin(code); }
  if (code.length === 6) return clientLogin(code);
  msg('Enter the 6-character client code or the 8-character producer code.');
}

async function clientLogin(code) {
  const { ok, d } = await api('client-login', { code, deviceId: dev });
  if (!ok) { S.fails++; return msg(d.error || 'Sign-in failed.'); }
  ls('ht_role', 'client'); ls('ht_id', d.client.id);
  S.role = 'client'; S.id = d.client.id;
  await loadClient();
}

async function producerLogin(code) {
  const { ok, d } = await api('producer-login', { code, deviceId: dev });
  if (!ok) { releaseAwake(); S.fails++; return msg(d.error || 'Sign-in failed.'); }
  ls('ht_role', 'producer'); ls('ht_id', d.producer.id);
  S.role = 'producer'; S.id = d.producer.id;
  await loadProducer();
}

async function loadClient() {
  const { ok, d } = await api('client-data', { clientId: S.id, deviceId: dev });
  if (!ok) { signOut(); return msg(d.error || 'Could not load your cattle. Try again.'); }
  S.data = {
    producerName: d.producerName || '',
    clients: [{ id: d.client.id, name: d.client.name, code: '', devicesLinked: 0, devices: [] }],
    animals: d.animals.map((a) => ({ ...a, clientId: d.client.id })),
    review: [],
    devices: []
  };
  S.cur = d.client.id; S.view = 'c'; draw();
}

async function loadProducer(opts) {
  opts = opts || {};
  const { ok, d } = await api('producer-data', { producerId: S.id, deviceId: dev });
  if (!ok) { signOut(); return msg(d.error || 'Could not load your account. Try again.'); }
  S.data = d;
  if (!opts.keep) { S.view = 'p'; S.mode = null; }
  if (!opts.quiet) draw();
  flushPark();
  return true;
}

function openClient(id) {
  leaveWeigh();
  S.cur = id; S.view = 'c'; S.mode = null; S.sel = []; S.q = ''; S.wq = ''; S.rc = false; S.rm = false; S.ra = null; S.del = null; S.cut = null;
  draw();
}
function backToClients() { leaveWeigh(); S.view = 'p'; S.mode = null; S.q = ''; S.wq = ''; S.cut = null; S.rc = false; S.rm = false; draw(); }
function backToList() { leaveWeigh(); S.mode = null; S.sel = []; S.hist = null; S.del = null; S.skipCapture = true; draw(); }

// Signing out does not free a device slot. The device id stays linked.
function signOut() {
  leaveWeigh();
  releaseAwake();
  ls('ht_role', null); ls('ht_id', null);
  S.view = 'l'; S.role = null; S.id = null; S.data = null; S.mode = null;
  draw();
}

async function addClient() {
  const name = $('#nn').value.trim();
  if (!name) return;
  const { ok, d } = await api('add-client', { producerId: S.id, deviceId: dev, name });
  if (!ok) return msg(d.error || 'Could not add client.');
  await loadProducer({ keep: true, quiet: true });
  openClient(d.client.id);
  msg(name + ' added. Share this code.');
}

async function shareCode(code) {
  const t = 'Your Herd Tracker code: ' + code;
  try { if (navigator.share) await navigator.share({ text: t }); else { await navigator.clipboard.writeText(t); msg('Code copied.'); } } catch (e) { msg('Client code: ' + code); }
}

async function removeClient(clientId) {
  if (!S.rm) { S.rm = true; S.rc = false; return draw(); }
  const named = clientOf(clientId);
  const name = named ? named.name : 'Client';
  const { ok, d } = await api('remove-client', { producerId: S.id, deviceId: dev, clientId });
  if (!ok) { S.rm = false; draw(); return msg(d.error || 'Could not remove the client.'); }
  const parked = readPark();
  if (parked && parked.clientId === clientId) writePark(null);
  S.view = 'p'; S.cur = null; S.mode = null; S.rc = false;
  await loadProducer({ keep: true, quiet: true });
  draw();
  msg(name + ' removed.');
}

async function reissueCode(clientId) {
  if (!S.rc) { S.rc = true; S.rm = false; return draw(); }
  const { ok, d } = await api('reissue-client-code', { producerId: S.id, deviceId: dev, clientId });
  S.rc = false;
  if (!ok) return msg(d.error || 'Could not reissue code.');
  await loadProducer({ keep: true, quiet: true });
  openClient(clientId);
  msg('New code: ' + d.code + '. The old code no longer works.');
}

async function removeDevice(scope, clientId, removeId) {
  const key = scope + ':' + (clientId || '') + ':' + removeId;
  if (S.cut !== key) { S.cut = key; return draw(); }
  S.cut = null;
  const { ok, d } = await api('remove-device', { producerId: S.id, deviceId: dev, scope, clientId: clientId || null, removeId });
  if (!ok) return msg(d.error || 'Could not remove the device.');
  if (d.signedOut) { signOut(); return msg('This device is signed out.'); }
  await loadProducer({ keep: true });
  msg('Device removed. The sign-in code still works.');
}

function setTargetInput(animalId, v) {
  const n = parseInt(String(v).replace(/\D/g, ''), 10);
  if (!n) return;
  commitTarget(animalId, n);
}
async function commitTarget(animalId, n) {
  const lb = Math.min(2500, Math.max(600, Math.round(n / 5) * 5));
  const a = animalById(animalId);
  a.targetLb = lb;
  draw();
  const body = S.role === 'client'
    ? { role: 'client', clientId: S.id, deviceId: dev, animalId, targetLb: lb }
    : { role: 'producer', producerId: S.id, deviceId: dev, clientId: a.clientId, animalId, targetLb: lb };
  const { ok } = await api('set-target', body);
  if (!ok) {
    msg('Could not save the target.');
    if (S.role === 'producer') await loadProducer({ keep: true });
    else await loadClient();
  }
}
function toggleSel(id) {
  S.sel = S.sel.includes(id) ? S.sel.filter((x) => x !== id) : [...S.sel, id];
  draw();
}
function startShip() { S.mode = 'sel'; S.sel = []; S.q = ''; draw(); }
function openHist(id) { S.mode = 'hist'; S.hist = id; S.del = null; draw(); }

async function confirmShip(clientId) {
  const date = $('#sd').value;
  if (!date) return msg('Pick a ship date.');
  const animals = [...document.querySelectorAll('.card [data-id]')].map((row) => {
    const id = row.dataset.id, input = row.querySelector('.sw');
    const shipLb = Math.round(parseFloat(String(input.value || '').replace(/[^\d.]/g, '')));
    return { id, shipLb: Number.isFinite(shipLb) ? shipLb : undefined };
  });
  const { ok, d } = await api('ship-animals', { producerId: S.id, deviceId: dev, clientId, shipDate: date, animals });
  if (!ok) return msg(d.error || 'Could not ship animals.');
  S.mode = null; S.sel = [];
  await loadProducer({ keep: true });
  msg(d.shipped + ' head shipped on ' + fmt(date) + '.');
}

async function reactivate(animalId) {
  if (S.ra !== animalId) { S.ra = animalId; return draw(); }
  S.ra = null;
  const a = animalById(animalId);
  const { ok, d } = await api('reactivate-animal', { producerId: S.id, deviceId: dev, clientId: a.clientId, animalId });
  if (!ok) return msg(d.error || 'Could not reactivate.');
  await loadProducer({ keep: true });
  msg(a.tag + ' is active again.');
}

async function resolveReview(reviewId) {
  const { ok, d } = await api('resolve-review', { producerId: S.id, deviceId: dev, reviewId });
  if (!ok) return msg(d.error || 'Could not resolve this.');
  await loadProducer();
  msg('Added as a new animal. The shipped record stays as history.');
}

function readPark() {
  try { return JSON.parse(ls('ht_weigh') || 'null'); } catch (e) { return null; }
}
function writePark(obj) { ls('ht_weigh', obj ? JSON.stringify(obj) : null); }
function parkedFor(clientId) {
  const p = readPark();
  return !!(p && p.producerId === S.id && p.clientId === clientId);
}
function parkNote() {
  const p = readPark();
  if (!p || p.producerId !== S.id) return '';
  const c = (S.data && S.data.clients || []).find((x) => x.id === p.clientId);
  const who = c ? c.name : 'a client';
  const why = p.hold ? p.hold : ('Weights for ' + who + ' are waiting for signal.');
  return `<div class=card><div class=hd>Saved on this phone</div><p class=mu>${esc(why)}</p><button type=button class=bt onclick="resumePark()">Open those weights</button></div>`;
}
function dirtyDraft(draft, date) {
  const out = {};
  Object.keys(draft || {}).forEach((id) => {
    const v = String(draft[id] == null ? '' : draft[id]).trim();
    if (!v) return;
    const a = S.data && animalById(id);
    if (a && weightOn(a, date) === v) return;
    out[id] = v;
  });
  return out;
}
function parkWeigh() {
  if (S.mode === 'weigh' && document.getElementById('wd')) captureWeigh();
  const mine = readPark();
  if (mine && mine.producerId === S.id && mine.clientId !== S.cur) return;
  const date = S.weighDate;
  const draft = dirtyDraft(S.draft, date);
  const newRows = (S.newRows || []).filter((r) => String(r.tag || '').trim() || String(r.weight || '').trim());
  if (!Object.keys(draft).length && !newRows.length) {
    if (mine && mine.clientId === S.cur && mine.producerId === S.id) writePark(null);
    return;
  }
  writePark({ producerId: S.id, clientId: S.cur, date, draft, newRows });
}
function leaveWeigh() {
  if (S.mode !== 'weigh') return;
  captureWeigh();
  parkWeigh();
}
function resumePark() {
  const p = readPark();
  if (!p || p.producerId !== S.id) return;
  S.cur = p.clientId; S.view = 'c'; S.mode = 'weigh';
  S.weighDate = p.date || today();
  S.draft = p.draft || {};
  S.newRows = (p.newRows && p.newRows.length) ? p.newRows : [{ tag: '', weight: '' }];
  S.skipCapture = true;
  draw();
}
function entriesFrom(draft, newRows, clientId) {
  const entries = [];
  const seenNew = {};
  Object.keys(draft || {}).forEach((id) => {
    if (String(draft[id]).trim() === '') return;
    entries.push({ animalId: id, weight: draft[id] });
  });
  for (const row of newRows || []) {
    const rawTag = String(row.tag || '').trim();
    const weight = String(row.weight || '').trim();
    if (!rawTag && !weight) continue;
    if (!weight) continue;
    if (!rawTag) return { error: 'Enter a tag number for that weight.' };
    const tag = tagNum(rawTag);
    if (!tag) return { error: 'Enter the tag as a number.' };
    if (seenNew[tag]) return { error: 'Tag ' + tag + ' is entered more than once.' };
    seenNew[tag] = true;
    const active = activeOf(clientId).find((a) => tagNum(a.tag) === tag);
    if (active) return { error: 'Tag ' + tag + ' is already active on this client. Enter the weight next to it in the list.' };
    entries.push({ tag, weight });
  }
  return { entries };
}
async function flushPark() {
  if (S.flushing || S.busy || S.role !== 'producer') return;
  const snap = ls('ht_weigh');
  const p = readPark();
  if (!p || p.producerId !== S.id || p.hold) return;
  if (!S.data) return;
  const tags = (p.tags || []).slice();
  if (tags.length) {
    S.flushing = true;
    for (let i = 0; i < tags.length; i++) {
      const sent = await api('add-tag', { producerId: S.id, deviceId: dev, clientId: p.clientId, tag: tags[i] });
      if (!sent.ok && sent.status !== 409) {
        S.flushing = false;
        if (sent.status !== 0) {
          p.hold = (sent.d && sent.d.error) || 'Could not save the tag.';
          writePark(p);
        }
        return;
      }
    }
    p.tags = [];
    writePark(p);
    S.flushing = false;
  }
  const built = entriesFrom(p.draft, p.newRows, p.clientId);
  if (built.error) { p.hold = built.error; writePark(p); return; }
  if (!built.entries.length) {
    if (ls('ht_weigh') === snap) writePark(null);
    if (tags.length) {
      await loadProducer({ keep: true });
      msg(tags.length + ' tag' + (tags.length === 1 ? '' : 's') + ' added.');
    }
    return;
  }
  S.flushing = true;
  const { ok, d, status } = await api('save-weighins', { producerId: S.id, deviceId: dev, clientId: p.clientId, date: p.date, entries: built.entries });
  S.flushing = false;
  if (!ok) {
    if (status !== 0) {
      p.hold = (d && d.error) || 'Could not save these weights.';
      writePark(p);
    }
    return;
  }
  if (ls('ht_weigh') === snap) writePark(null);
  const n = (d.saved || 0) + (d.updated || 0);
  if (S.mode === 'weigh' && S.cur === p.clientId && ls('ht_weigh') == null) {
    S.mode = null; S.draft = {}; S.newRows = []; S.skipCapture = true;
  }
  await loadProducer({ keep: true });
  msg(n + ' weights saved' + (d.created ? ', ' + d.created + ' new animals' : '') + '.');
  if (ls('ht_weigh')) flushPark();
}
let wakeLock;
let wakeVideo;
async function stayAwake(on) {
  if (!on) { releaseAwake(); return; }
  try {
    if (navigator.wakeLock && (!wakeLock || wakeLock.released)) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (e) { wakeLock = null; }
  try {
    const v = ensureWakeVideo();
    if (v.paused) await v.play();
  } catch (e) {}
}
function ensureWakeVideo() {
  if (wakeVideo) return wakeVideo;
  const v = document.createElement('video');
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.muted = true;
  v.loop = true;
  v.src = v.canPlayType('video/mp4') ? '/wake.mp4' : '/wake.webm';
  v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(v);
  wakeVideo = v;
  return v;
}
function releaseAwake() {
  const lock = wakeLock;
  wakeLock = null;
  if (lock) lock.release().catch(() => {});
  if (wakeVideo && !wakeVideo.paused) wakeVideo.pause();
}
function filterWeigh(v) {
  S.wq = v;
  const q = v.trim();
  document.querySelectorAll('.wrow').forEach((el) => {
    const tag = el.getAttribute('data-tag') || '';
    el.hidden = !!(q && tag.indexOf(q) === -1);
  });
}
function nextEmpty(el) {
  const list = [...document.querySelectorAll('.wrow:not([hidden]) [data-wid], [data-new] .nw')];
  const i = list.indexOf(el);
  for (let n = i + 1; n < list.length; n++) {
    if (!String(list[n].value).trim()) {
      list[n].focus();
      list[n].scrollIntoView({ block: 'center' });
      return;
    }
  }
  const tag = document.querySelector('.nt');
  if (tag) { tag.focus(); tag.scrollIntoView({ block: 'center' }); }
}

function captureWeigh() {
  const wd = document.getElementById('wd');
  if (!wd) return;
  S.weighDate = wd.value || S.weighDate;
  S.draft = {};
  document.querySelectorAll('[data-wid]').forEach((el) => { S.draft[el.dataset.wid] = el.value; });
  const rows = [...document.querySelectorAll('[data-new]')];
  if (rows.length) {
    S.newRows = rows.map((row) => ({
      tag: row.querySelector('.nt').value,
      weight: row.querySelector('.nw').value
    }));
  }
}
function startWeigh() {
  const p = readPark();
  if (p && p.producerId === S.id && p.clientId !== S.cur) {
    return msg('Weights are still saved on this phone. Open those weights before starting another pen.');
  }
  S.mode = 'weigh';
  S.rm = false;
  S.rc = false;
  if (p && p.producerId === S.id && p.clientId === S.cur) {
    S.weighDate = p.date || today();
    S.draft = p.draft || {};
    S.newRows = (p.newRows && p.newRows.length) ? p.newRows : [{ tag: '', weight: '' }];
  } else {
    S.weighDate = today();
    S.draft = {};
    S.newRows = [{ tag: '', weight: '' }];
  }
  S.wq = '';
  S.skipCapture = true;
  draw();
}
function setWeighDate(v) {
  const typed = [...document.querySelectorAll('[data-wid]')].some((el) => el.value.trim());
  captureWeigh();
  S.weighDate = v;
  S.draft = {};
  S.skipCapture = true;
  draw();
  if (typed) msg('Date changed. The boxes show weights already saved for this date.');
}
async function saveTag(clientId) {
  if (S.busy) return;
  const raw = (document.getElementById('newtag').value || '').trim();
  const tag = tagNum(raw);
  if (!tag) return msg('Enter the tag as a number.');
  const active = activeOf(clientId).find((a) => tagNum(a.tag) === tag);
  if (active) return msg('Tag ' + tag + ' is already active on this client. Enter the weight next to it in the list.');
  S.busy = true;
  const { ok, d, status } = await api('add-tag', { producerId: S.id, deviceId: dev, clientId, tag });
  S.busy = false;
  if (!ok) {
    if (status === 0) {
      const p = readPark() || { producerId: S.id, clientId, date: S.weighDate || today(), draft: dirtyDraft(S.draft, S.weighDate), newRows: [] };
      if (p.clientId !== clientId) return msg('Weights are still saved on this phone for another client.');
      p.tags = p.tags || [];
      if (p.tags.indexOf(tag) === -1) p.tags.push(tag);
      writePark(p);
      document.getElementById('newtag').value = '';
      return msg('Saved on this phone, waiting for signal.');
    }
    return msg((d && d.error) || 'Could not save the tag.');
  }
  document.getElementById('newtag').value = '';
  S.skipCapture = true;
  await loadProducer({ keep: true });
  msg('Tag ' + tag + ' added. Enter its weight in the list.');
}
async function saveWeigh(clientId) {
  if (S.busy) return;
  if (!S.skipCapture) captureWeigh();
  S.skipCapture = false;
  const date = S.weighDate;
  if (!date) return msg('Pick a weigh date.');
  const entries = [];
  Object.keys(S.draft).forEach((id) => {
    if (String(S.draft[id]).trim() === '') return;
    entries.push({ animalId: id, weight: S.draft[id] });
  });
  const seenNew = {};
  for (const row of S.newRows) {
    const rawTag = String(row.tag || '').trim();
    const weight = String(row.weight || '').trim();
    if (!rawTag || !weight) continue;
    const tag = tagNum(rawTag);
    if (!tag) return msg('Enter the tag as a number.');
    if (seenNew[tag]) return msg('Tag ' + tag + ' is entered more than once.');
    seenNew[tag] = true;
    const active = activeOf(clientId).find((a) => tagNum(a.tag) === tag);
    if (active) return msg('Tag ' + tag + ' is already active on this client. Enter the weight next to it in the list.');
    entries.push({ tag, weight });
  }
  if (!entries.length) return msg('Enter at least one weight.');
  parkWeigh();
  S.busy = true;
  const btn = document.getElementById('savew');
  if (btn) btn.disabled = true;
  msg('Saving…');
  const { ok, d, status } = await api('save-weighins', { producerId: S.id, deviceId: dev, clientId, date, entries });
  S.busy = false;
  if (btn) btn.disabled = false;
  if (!ok) {
    parkWeigh();
    if (status === 0) return msg('Saved on this phone, waiting for signal.');
    return msg(d.error || 'Could not save weights. The numbers are still here.');
  }
  writePark(null);
  S.mode = null; S.draft = {}; S.newRows = []; S.skipCapture = true;
  await loadProducer({ keep: true });
  const n = (d.saved || 0) + (d.updated || 0);
  msg(n + ' weights saved' + (d.created ? ', ' + d.created + ' new animals' : '') + (d.updated ? ', ' + d.updated + ' corrected' : '') + '.');
}

async function sendWeigh(body) {
  const { ok, d } = await api('animal-edit', Object.assign({ producerId: S.id, deviceId: dev, action: 'save-weigh' }, body));
  if (!ok) return msg((d && d.error) || 'Could not save the weigh-in.');
  const next = (d && d.animalId) || body.animalId;
  S.del = null; S.mode = 'hist'; S.hist = next; S.skipCapture = true;
  await loadProducer({ keep: true });
  msg(next !== body.animalId ? 'Started a new animal with that tag. The shipped record stays as history.' : 'Weigh-in saved.');
}
function saveHistRow(animalId, btn) {
  const row = btn.closest('[data-prev]');
  sendWeigh({ animalId, date: row.querySelector('.hdte').value, weight: row.querySelector('.hwt').value, previousDate: row.getAttribute('data-prev') });
}
function addHistWeigh(animalId) {
  sendWeigh({ animalId, date: document.getElementById('ad').value, weight: document.getElementById('aw').value });
}
async function deleteWeigh(animalId, date) {
  const key = 'w:' + animalId + ':' + date;
  if (S.del !== key) { S.del = key; return draw(); }
  const { ok, d } = await api('animal-edit', { producerId: S.id, deviceId: dev, animalId, action: 'delete-weigh', date, confirm: true });
  if (!ok) return msg(d.error || 'Could not remove that weigh-in.');
  S.del = null; S.mode = 'hist'; S.hist = animalId; S.skipCapture = true;
  await loadProducer({ keep: true });
  msg('Weigh-in removed.');
}
async function deleteAnimal(id) {
  if (S.del !== 'a:' + id) { S.del = 'a:' + id; return draw(); }
  const { ok, d } = await api('animal-edit', { producerId: S.id, deviceId: dev, animalId: id, action: 'delete', confirm: true });
  if (!ok) return msg(d.error || 'Could not remove the animal.');
  S.del = null; S.mode = null; S.hist = null; S.skipCapture = true;
  await loadProducer({ keep: true });
  msg('Animal removed.');
}
async function renameAnimal(id) {
  const tag = document.getElementById('tagname').value.trim();
  if (!tag) return msg('Enter a tag number.');
  const { ok, d } = await api('animal-edit', { producerId: S.id, deviceId: dev, animalId: id, action: 'rename', tag });
  if (!ok) return msg(d.error || 'Could not rename the tag.');
  S.mode = 'hist'; S.hist = id; S.skipCapture = true;
  await loadProducer({ keep: true });
  msg('Tag saved.');
}

function pageTools(kind, clientId) {
  const dl = clientId ? `downloadClient('${clientId}')` : 'downloadAll()';
  const pr = clientId ? `printClient('${clientId}')` : 'printAll()';
  return `<div class=tools><button type=button onclick="openHow('${kind}')">How this works</button><button type=button onclick="${pr}">Print</button><button type=button onclick="${dl}">Download CSV</button></div>`;
}
function openHow(kind) {
  const box = document.getElementById('how');
  if (!box) return;
  const producer = kind === 'producer';
  const steps = producer ? [
    'Sign in once on this phone with your 8-character code. It stays signed in.',
    'Add a client at the bottom of your list. The page opens on that client and shows a 6-character code. Share that code. That is how the client sees their cattle.',
    'Remove client is at the bottom of that page. Tap it, then tap again to confirm. That deletes the client, their cattle, and every weight. It cannot be undone.',
    'Reissue code makes a new 6-character code and signs the client phones out. The cattle stay.',
    'Tap Weigh. The date is today on this phone. Change it when you are entering an older weigh-in. Use whole pounds. Decimals are not accepted.',
    'Tags already in the herd are listed as numbers only. Type the pounds next to the tag. Next on the keyboard moves to the next empty animal.',
    'A brand-new tag goes under Add a tag. Save the number only. Then enter its weight next to that tag in the list.',
    'The target number under each animal is shared with the client. Either of you can change it. The other phone shows the new number the next time the app is opened. Beside that number the card says On Target, the estimated date, or why a date is not ready. It also says when an animal is gaining slower than this group.',
    'If the signal drops, weights and new tags stay on this phone and send when you have service again.',
    'Ship from the list when cattle leave. Reactivate only if that ship was marked by mistake.',
    'A shipped tag can be used again. That starts a new animal. The old weights stay on the shipped record.',
    'Download CSV or Print at the bottom of the page. The file and the paper copy are the record for you or the client.'
  ] : [
    'Sign in once with the 6-character code from your producer. It stays signed in on this phone.',
    'On an iPhone, tap Share, then Add to Home Screen, so it opens like an app in the truck or at the lot.',
    'The top of the page shows head, pounds per day, and average pounds. Under that are typical, earliest, and latest. Those dates are for cattle still short of their target.',
    'Each tag shows the latest weight. Beside the target it says On Target, an estimated date, gain too low to date, or weigh again to date. It also says when an animal is gaining slower than this group.',
    'Find a tag to jump to one animal. Past Weights shows every weigh-in for that tag.',
    'The target number under each animal is shared with your producer. Either of you can change it. Open the app again to see a change made on the other phone.',
    'Shipped cattle stay in the list below, with their own history. Those weights are not mixed into the cattle still on feed.',
    'Download CSV or Print at the bottom of this page to keep a copy.'
  ];
  box.hidden = false;
  box.innerHTML = `<div class=card><div class=hd>${producer ? 'Producer' : 'Client'}: how this works</div><ol>${steps.map((s) => '<li>' + esc(s) + '</li>').join('')}</ol><button type=button class=bt onclick="closeHow()">Close</button></div>`;
  box.scrollTop = 0;
}
function closeHow() {
  const box = document.getElementById('how');
  if (!box) return;
  box.hidden = true;
  box.innerHTML = '';
}
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function fileName(name) {
  const clean = String(name || 'weights').replace(/[^\w\-]+/g, '-').replace(/^-|-$/g, '') || 'weights';
  return clean + '-weights.csv';
}
function rowsFor(list) {
  const rows = [];
  const animals = list.slice().sort(tagSort);
  animals.forEach((a, i) => {
    const w = (a.weighins || []).slice().sort((x, y) => String(x[0]).localeCompare(String(y[0])));
    if (!w.length) rows.push([a.tag, a.status, '', '', a.targetLb, a.shipDate || '', a.shipLb == null ? '' : a.shipLb]);
    else w.forEach(([d, lb]) => {
      rows.push([a.tag, a.status, d, lb, a.targetLb, a.shipDate || '', a.shipLb == null ? '' : a.shipLb]);
    });
    if (i < animals.length - 1) rows.push([]);
  });
  return rows;
}
function csvText(sections) {
  const header = ['Tag', 'Status', 'Weigh date', 'Weight lb', 'Target lb', 'Ship date', 'Ship weight lb'];
  const lines = [];
  sections.forEach((section, i) => {
    if (i) lines.push('');
    lines.push(csvCell(section.title));
    lines.push(header.map(csvCell).join(','));
    section.rows.forEach((r) => lines.push(r.map(csvCell).join(',')));
  });
  return lines.join('\r\n');
}
function saveCsv(name, sections) {
  const blob = new Blob(['\uFEFF' + csvText(sections)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function downloadClient(id) {
  const c = clientOf(id);
  if (!c) return;
  const list = S.data.animals.filter((a) => a.clientId === id);
  saveCsv(fileName(c.name), [{ title: c.name, rows: rowsFor(list) }]);
}
function downloadAll() {
  const sections = clientsSorted().map((c) => ({
    title: c.name,
    rows: rowsFor(S.data.animals.filter((a) => a.clientId === c.id))
  }));
  saveCsv('all-clients-weights.csv', sections);
}

function paperDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function weighHistory(a) {
  const w = (a.weighins || []).slice().sort((x, y) => String(x[0]).localeCompare(String(y[0])));
  if (!w.length) return '<p>No weights recorded.</p>';
  return '<ul>' + w.map(([d, lb]) => '<li>' + paperDate(d) + ' · ' + lb + ' lb</li>').join('') + '</ul>';
}
function printClient(id) {
  const sheet = document.getElementById('sheet');
  const html = clientSheet(id);
  if (!sheet || !html) return;
  sheet.innerHTML = html;
  window.print();
}
function printAll() {
  const sheet = document.getElementById('sheet');
  if (!sheet) return;
  const parts = clientsSorted().map((c) => clientSheet(c.id)).filter(Boolean);
  sheet.innerHTML = parts.join('<hr>') || '<p>No clients yet.</p>';
  window.print();
}
function clientSheet(id) {
  const c = clientOf(id);
  if (!c) return '';
  const active = activeOf(id).slice().sort(tagSort);
  const shipped = shippedOf(id).slice().sort((a, b) => (b.shipDate || '').localeCompare(a.shipDate || '') || tagSort(a, b));
  const activeHtml = active.map((a) => {
    const s = st(a);
    const bits = [];
    if (s.wt == null) bits.push('No weight yet');
    else bits.push(s.wt + ' lb on ' + paperDate(s.date));
    bits.push('Target ' + a.targetLb + ' lb');
    if (s.toGo != null) bits.push(s.toGo + ' lb to go');
    if (s.atTarget) bits.push('At target');
    else if (s.finish) bits.push('Finish ' + paperDate(s.finish));
    else if (s.estimateNote === 'low') bits.push('Gain is too low to estimate a date');
    else if (s.wt != null) bits.push('Weigh again to estimate a date');
    const rate = [];
    if (s.adg != null) rate.push(s.adg.toFixed(2) + ' lb/day last weigh');
    if (s.lifeAdg != null) rate.push(s.lifeAdg.toFixed(2) + ' lb/day since arrival');
    return `<article><h3>Tag ${esc(a.tag)}</h3><p>${bits.join(' · ')}</p>${rate.length ? '<p>' + rate.join(' · ') + '</p>' : ''}${weighHistory(a)}</article>`;
  }).join('') || '<p>No active animals.</p>';
  const shippedHtml = shipped.map((a) => {
    const w = (a.weighins || []).slice().sort((x, y) => String(x[0]).localeCompare(String(y[0])));
    const inn = w.length ? w[0][1] : null;
    const gain = inn != null && a.shipLb != null ? a.shipLb - inn : null;
    const gainText = gain == null ? 'Gain not available' : (gain >= 0 ? '+' : '') + gain + ' lb';
    return `<article><h3>Tag ${esc(a.tag)}</h3><p>In ${inn == null ? '—' : inn + ' lb'} · Ship ${a.shipLb == null ? '—' : a.shipLb + ' lb'} · Shipped ${paperDate(a.shipDate)} · ${gainText}</p>${weighHistory(a)}</article>`;
  }).join('') || '<p>None.</p>';
  return `<h1>${esc(c.name)}</h1><p class=when>Printed ${paperDate(today())}</p><h2>Active · ${active.length}</h2>${activeHtml}<h2>Shipped · ${shipped.length}</h2>${shippedHtml}`;
}

// ───────────────────────────── boot ─────────────────────────────
(async function boot() {
  const role = ls('ht_role'), id = ls('ht_id');
  if (role === 'client' && id) { S.role = 'client'; S.id = id; await loadClient(); return; }
  if (role === 'producer' && id) { S.role = 'producer'; S.id = id; await loadProducer(); return; }
  draw();
})();

if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
  window.herdPreview = function (mode) {
    S.role = 'producer'; S.view = 'c'; S.cur = 'c1'; S.id = 'p1'; S.mode = mode || null;
    S.weighDate = today(); S.draft = {}; S.newRows = [{ tag: '', weight: '' }]; S.q = '';
    S.data = {
      producer: { name: 'Miller Feedyard' },
      devices: [{ deviceId: dev, linkedAt: '2026-10-01T18:00:00Z' }, { deviceId: 'other-device', linkedAt: '2026-09-02T18:00:00Z' }],
      review: [],
      clients: [{ id: 'c1', name: 'Hartley Ranch', code: 'ABC123', devicesLinked: 1, devices: [{ deviceId: 'client-phone', linkedAt: '2026-08-15T18:00:00Z' }] }],
      animals: [
        { id: 'a1', clientId: 'c1', tag: '12', targetLb: 1500, status: 'active', weighins: [['2026-09-01', 1100], ['2026-10-01', 1250]] },
        { id: 'a2', clientId: 'c1', tag: '4', targetLb: 1500, status: 'active', weighins: [] },
        { id: 'a3', clientId: 'c1', tag: '2', targetLb: 1500, status: 'active', weighins: [['2026-09-01', 1400], ['2026-10-01', 1550]] },
        { id: 'a4', clientId: 'c1', tag: '7', targetLb: 1500, status: 'active', weighins: [['2026-09-01', 900], ['2026-10-01', 960]] },
        { id: 'a5', clientId: 'c1', tag: '5', targetLb: 1500, status: 'active', weighins: [['2026-09-01', 1000], ['2026-10-01', 1005]] },
        { id: 'a6', clientId: 'c1', tag: '9', targetLb: 1500, status: 'active', weighins: [['2026-10-01', 1100]] }
      ]
    };
    S.skipCapture = true;
    draw();
  };
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
window.addEventListener('online', () => { if (S.role === 'producer') flushPark(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    stayAwake(S.role === 'producer' && S.view !== 'l');
    refreshShared();
  } else releaseAwake();
});
document.addEventListener('pointerdown', () => {
  if (S.role === 'producer' && S.view !== 'l') stayAwake(true);
});

let refreshing = false;
async function refreshShared() {
  if (refreshing || S.view === 'l' || !S.role || !S.id) return;
  if (document.visibilityState === 'hidden') return;
  if (S.mode === 'weigh' || S.mode === 'conf' || S.mode === 'sel' || S.mode === 'hist') return;
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
  refreshing = true;
  try {
    if (S.role === 'producer') await loadProducer({ keep: true });
    else await loadClient();
  } finally { refreshing = false; }
}
