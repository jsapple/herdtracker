// Date and gain math for Herd Tracker. Loaded in the browser as HerdStats,
// and required by the node check. Dates are calendar dates (YYYY-MM-DD).
// localToday uses the device clock, never UTC.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HerdStats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_ADG = 0.5;

  function pad(n) { return String(n).padStart(2, '0'); }

  function localToday() {
    const n = new Date();
    return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
  }

  function addDays(iso, days) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }

  function daysBetween(a, b) {
    const p = (s) => {
      const [y, m, d] = s.split('-').map(Number);
      return Date.UTC(y, m - 1, d);
    };
    return Math.round((p(b) - p(a)) / 864e5);
  }

  function sortedWeighins(a) {
    return (a.weighins || []).slice().sort((x, y) => String(x[0]).localeCompare(String(y[0])));
  }

  // One animal, from its own weigh-ins. `today` is a calendar date.
  // finish is anchored on this animal's last weigh date.
  function animalStats(a, today) {
    const w = sortedWeighins(a);
    const base = {
      id: a.id, tag: a.tag, targetLb: a.targetLb, status: a.status,
      wt: null, date: null, adg: null, lifeAdg: null, toGo: null,
      days: null, finish: null, since: null, atTarget: false,
      estimateNote: null, weighins: w
    };
    if (!w.length) return base;
    const first = w[0], last = w[w.length - 1];
    const prev = w.length > 1 ? w[w.length - 2] : null;
    const adg = prev && last[0] > prev[0] ? (last[1] - prev[1]) / daysBetween(prev[0], last[0]) : null;
    const lifeAdg = w.length > 1 && last[0] > first[0] ? (last[1] - first[1]) / daysBetween(first[0], last[0]) : null;
    const toGo = Math.max(0, a.targetLb - last[1]);
    const atTarget = last[1] >= a.targetLb;
    let days = null, finish = null, estimateNote = null;
    if (atTarget) {
      days = 0;
      finish = last[0];
    } else if (!prev) {
      estimateNote = 'again';
    } else if (adg == null || adg < MIN_ADG) {
      estimateNote = 'low';
    } else {
      days = Math.ceil(toGo / adg);
      finish = addDays(last[0], days);
    }
    return {
      ...base,
      wt: last[1], date: last[0], adg, lifeAdg, toGo, days, finish,
      since: daysBetween(last[0], today), atTarget, estimateNote, weighins: w
    };
  }

  function medianIso(dates) {
    const s = dates.slice().sort();
    const n = s.length;
    if (!n) return null;
    if (n % 2) return s[(n - 1) / 2];
    const a = s[n / 2 - 1], b = s[n / 2];
    return addDays(a, Math.round(daysBetween(a, b) / 2));
  }

  function groupStats(animals, today) {
    const rows = animals.map((a) => animalStats(a, today));
    const weighed = rows.filter((r) => r.wt != null);
    const withAdg = weighed.filter((r) => r.adg != null);
    const avg = weighed.length ? weighed.reduce((s, r) => s + r.wt, 0) / weighed.length : null;
    const adg = withAdg.length ? withAdg.reduce((s, r) => s + r.adg, 0) / withAdg.length : null;
    const finishing = weighed.filter((r) => r.finish && !r.atTarget && r.days > 0);
    const dates = finishing.map((r) => r.finish);
    const sortedDates = dates.slice().sort();
    return {
      rows, avg, adg,
      typical: medianIso(dates),
      earliest: sortedDates[0] || null,
      latest: sortedDates.length ? sortedDates[sortedDates.length - 1] : null,
      waiting: rows.filter((r) => r.estimateNote === 'again').length,
      noWeight: rows.filter((r) => r.wt == null).length,
      atTarget: rows.filter((r) => r.atTarget).length,
      slower: adg == null ? [] : withAdg.filter((r) => r.adg < adg * 0.85).map((r) => r.id),
      head: rows.length
    };
  }

  // Average weight of the group on each real weigh date. An animal that
  // missed a date keeps its last known weight.
  function chartSeries(animals) {
    const dates = [...new Set(animals.flatMap((a) => sortedWeighins(a).map((w) => w[0])))].sort();
    const ser = [];
    for (const d of dates) {
      const weights = [];
      for (const a of animals) {
        const past = sortedWeighins(a).filter((w) => w[0] <= d);
        if (past.length) weights.push(past[past.length - 1][1]);
      }
      if (weights.length) ser.push([d, weights.reduce((s, x) => s + x, 0) / weights.length]);
    }
    return ser;
  }

  return { MIN_ADG, localToday, addDays, daysBetween, animalStats, groupStats, chartSeries, medianIso };
});
