// Pure helpers for routes/analytics.js — no database access here, so they can be
// tested on their own. Dates are plain "YYYY-MM-DD" strings (Philippine calendar dates).

const round1 = (n) => Math.round(n * 10) / 10;
const toIso = (d) => d.toISOString().slice(0, 10);

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Move an ISO date by N days (negative = backwards).
function shiftIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

function mondayOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

// ── Metric 2: appointment status counts ─────────────────────────────────────
// rows come from: $group by status → [{ _id: 'PENDING', count: 4 }, ...]
function summarizeStatuses(rows) {
  const out = { PENDING: 0, APPROVED: 0, REJECTED: 0, COMPLETED: 0, CANCELLED: 0, MISSED: 0, OTHER: 0, total: 0 };
  rows.forEach((r) => {
    // CANCELLED* and MISSED* variants (by student / faculty / on leave) fold into one bucket each
    const raw = typeof r._id === 'string' ? r._id : '';
    const key = raw.startsWith('CANCELLED') ? 'CANCELLED' : raw.startsWith('MISSED') ? 'MISSED' : raw;
    const known = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'MISSED'].includes(key);
    out[known ? key : 'OTHER'] += r.count;
    out.total += r.count;
  });
  return out;
}

// ── Metric 3: purposes — keep the top N, fold the long tail into "Other" ─────
// rows: [{ purpose, count }] sorted by count descending
function collapsePurposes(rows, top = 6) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (!total) return { total: 0, items: [] };

  const items = rows.slice(0, top).map((r) => ({
    label: capitalize(r.purpose),
    count: r.count,
    percent: round1((r.count / total) * 100),
  }));

  const tailCount = rows.slice(top).reduce((s, r) => s + r.count, 0);
  if (tailCount > 0) {
    items.push({ label: 'Other', count: tailCount, percent: round1((tailCount / total) * 100) });
  }
  return { total, items };
}

// ── Appointments per week (last N weeks, weeks start on Monday) ─────────────
function weekRange(todayIso, weeks = 8) {
  const thisMonday = mondayOf(todayIso);
  const keys = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const s = new Date(thisMonday);
    s.setUTCDate(s.getUTCDate() - i * 7);
    keys.push({ key: toIso(s), label: `${s.getUTCMonth() + 1}/${s.getUTCDate()}` });
  }
  const end = new Date(thisMonday);
  end.setUTCDate(end.getUTCDate() + 6);
  return { startIso: keys[0].key, endIso: toIso(end), keys };
}

// rows: [{ _id: '2026-10-08', count: 2 }, ...]  (appointments grouped by their date)
function bucketWeekly(range, rows) {
  const counts = new Map(range.keys.map((k) => [k.key, 0]));
  rows.forEach((r) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r._id || '')) return;
    const key = toIso(mondayOf(r._id));
    if (counts.has(key)) counts.set(key, counts.get(key) + r.count);
  });
  return range.keys.map((k) => ({ label: k.label, value: counts.get(k.key) }));
}

// ── Metric 1: demographics — turn grouped rows into chart-ready data ────────
function sortYearRows(rows) {
  return rows
    .map((r) => ({ label: r._id === 'Unspecified' ? 'Unspecified' : `Year ${r._id}`, value: r.count, sort: r._id === 'Unspecified' ? 99 : Number(r._id) }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ label, value }) => ({ label, value }));
}

function toLabelValues(rows) {
  return rows.map((r) => ({ label: r._id, value: r.count }));
}

function countForRole(roleRows, role) {
  const hit = roleRows.find((r) => r._id === role);
  return hit ? hit.count : 0;
}


module.exports = {
  shiftIso, summarizeStatuses, collapsePurposes, weekRange, bucketWeekly,
  sortYearRows, toLabelValues, countForRole,
};
