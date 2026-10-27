const fs = require('fs');
const path = require('path');
const stats = require('../public/stats.js');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '../public/stats.js'), 'utf8');
const fn = src.slice(src.indexOf('function localToday'), src.indexOf('function addDays'));
assert.ok(!fn.includes('toISOString'), 'localToday must not use UTC');
assert.ok(fn.includes('getFullYear'), 'localToday must use the device calendar');

const n = new Date();
const pad = (x) => String(x).padStart(2, '0');
const local = n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
const utc = n.toISOString().slice(0, 10);
assert.strictEqual(stats.localToday(), local);
if (local !== utc) assert.notStrictEqual(stats.localToday(), utc);

const finishing = {
  id: 'a', tag: '1', targetLb: 1400, status: 'active',
  weighins: [['2026-01-01', 1000], ['2026-02-01', 1100]]
};
const s = stats.animalStats(finishing, '2026-03-01');
const adg = 100 / 31;
const days = Math.ceil(300 / adg);
assert.strictEqual(s.finish, stats.addDays('2026-02-01', days));
assert.notStrictEqual(s.finish, stats.addDays('2026-03-15', days));
assert.strictEqual(s.date, '2026-02-01');
assert.ok(s.lifeAdg > 0);

const none = { id: 'b', tag: '2', targetLb: 1500, status: 'active', weighins: [] };
const weighed = { id: 'c', tag: '3', targetLb: 1500, status: 'active', weighins: [['2026-02-01', 1000]] };
const g = stats.groupStats([weighed, none], '2026-03-01');
assert.strictEqual(g.avg, 1000);
assert.strictEqual(stats.animalStats(none, '2026-03-01').wt, null);

const low = stats.animalStats({
  id: 'd', tag: '4', targetLb: 1500, status: 'active',
  weighins: [['2026-01-01', 1000], ['2026-02-01', 1010]]
}, '2026-03-01');
assert.ok(low.adg < 0.5);
assert.strictEqual(low.finish, null);
assert.strictEqual(low.estimateNote, 'low');

const one = stats.animalStats(weighed, '2026-03-01');
assert.strictEqual(one.finish, null);
assert.strictEqual(one.estimateNote, 'again');
assert.strictEqual(one.toGo, 500);

const done = {
  id: 'e', tag: '5', targetLb: 1500, status: 'active',
  weighins: [['2025-12-01', 1400], ['2026-01-15', 1500]]
};
const group = stats.groupStats([finishing, done], '2026-03-01');
assert.strictEqual(group.typical, s.finish);
assert.notStrictEqual(group.typical, '2026-01-15');
assert.strictEqual(group.earliest, s.finish);
assert.strictEqual(group.latest, s.finish);
assert.strictEqual(group.atTarget, 1);

const series = stats.chartSeries([
  { weighins: [['2026-01-01', 100]] },
  { weighins: [['2026-02-01', 300]] }
]);
assert.strictEqual(series.length, 2);
assert.strictEqual(series[1][1], 200);

console.log('stats ok', { local, utc, finish: s.finish, days });
