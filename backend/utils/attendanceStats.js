// Attendance vs. consultation statistics (pure functions, no DB access).
//
// "Attendance" is derived from the faculty's daily status check-ins
// (StatusHistory): on every day the faculty is scheduled (has a class or
// consultation block), the FIRST status update of that day is the check-in.
// It is "on time" if it happens no later than the start of the first block
// that day (+ ON_TIME_GRACE_MIN). Times are Philippine time (UTC+8).

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
const ON_TIME_GRACE_MIN = 0;

const pad = (n) => String(n).padStart(2, '0');

// Date -> { date:'YYYY-MM-DD', minutes: minutes since PH midnight }
function phParts(d) {
  const s = new Date(new Date(d).getTime() + PH_OFFSET_MS);
  return {
    date: `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`,
    minutes: s.getUTCHours() * 60 + s.getUTCMinutes(),
  };
}

const phToday = (now = new Date()) => phParts(now).date;

const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };

function dayOfWeekOfDate(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}

function eachDate(start, end) {
  const out = [];
  let t = new Date(start + 'T00:00:00Z').getTime();
  const e = new Date(end + 'T00:00:00Z').getTime();
  while (t <= e) {
    const d = new Date(t);
    out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
    t += 86400000;
  }
  return out;
}

// 'YYYY-MM' -> { start, end } (inclusive)
function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * @param faculty   [{ _id, name, createdAt? }]
 * @param blocks    [{ facultyId, dayOfWeek, startTime }]  class + consultation blocks
 * @param history   [{ facultyId, status, timestamp }]
 * @param completed [{ facultyId, completedAt?, date? }]   COMPLETED appointments
 * @param start,end 'YYYY-MM-DD' inclusive (PH dates)
 * @param trackingSince 'YYYY-MM-DD' | null  – days before this are not judged
 * @param today     'YYYY-MM-DD' PH today
 */
function computeAttendanceStats({ faculty, blocks, history, completed, start, end, trackingSince, today }) {
  const days = eachDate(start, end);
  const rows = faculty.map((f) => {
    const id = String(f._id);
    const myBlocks = blocks.filter((b) => String(b.facultyId) === id);
    const firstStart = {}; // dow -> earliest start minutes
    myBlocks.forEach((b) => {
      const m = toMin(b.startTime);
      if (firstStart[b.dayOfWeek] === undefined || m < firstStart[b.dayOfWeek]) firstStart[b.dayOfWeek] = m;
    });

    // first status entry per PH day
    const byDay = {};
    history
      .filter((h) => String(h.facultyId) === id)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .forEach((h) => {
        const p = phParts(h.timestamp);
        if (!byDay[p.date]) byDay[p.date] = [];
        byDay[p.date].push({ status: h.status, minutes: p.minutes });
      });

    const createdDate = f.createdAt ? phParts(f.createdAt).date : null;
    let scheduledDays = 0, onTime = 0, late = 0, missed = 0, excused = 0;

    days.forEach((d) => {
      if (d > today) return;
      if (trackingSince && d < trackingSince) return;
      if (createdDate && d < createdDate) return;
      const fs = firstStart[dayOfWeekOfDate(d)];
      if (fs === undefined) return; // not a duty day
      const entries = byDay[d] || [];
      if (entries.some((e) => e.status === 'ON_LEAVE')) { excused++; return; }
      const checkIns = entries.filter((e) => e.status !== 'ABSENT');
      if (!checkIns.length) {
        if (d === today) return; // day not over yet — don't judge
        scheduledDays++; missed++; return;
      }
      scheduledDays++;
      if (checkIns[0].minutes <= fs + ON_TIME_GRACE_MIN) onTime++; else late++;
    });

    const consultations = completed.filter((a) => {
      if (String(a.facultyId) !== id) return false;
      const d = a.completedAt ? phParts(a.completedAt).date : a.date;
      return d >= start && d <= end;
    }).length;

    const checkedIn = onTime + late;
    return {
      facultyId: id,
      name: f.name,
      consultations,
      scheduledDays,
      onTime,
      late,
      missed,
      excused,
      checkedInPct: scheduledDays ? Math.round((checkedIn / scheduledDays) * 100) : null,
      onTimePct: scheduledDays ? Math.round((onTime / scheduledDays) * 100) : null,
    };
  });

  const withData = rows.filter((r) => r.scheduledDays > 0);
  const correlation = withData.length >= 5
    ? pearson(withData.map((r) => r.onTimePct), withData.map((r) => r.consultations))
    : null;

  const totalDays = withData.reduce((a, r) => a + r.scheduledDays, 0);
  const totalOnTime = withData.reduce((a, r) => a + r.onTime, 0);

  return {
    rows,
    summary: {
      facultyWithData: withData.length,
      totalConsultations: rows.reduce((a, r) => a + r.consultations, 0),
      overallOnTimePct: totalDays ? Math.round((totalOnTime / totalDays) * 100) : null,
      correlation: correlation === null ? null : Math.round(correlation * 100) / 100,
    },
  };
}

module.exports = {
  ON_TIME_GRACE_MIN, phParts, phToday, dayOfWeekOfDate, eachDate, monthRange, pearson, computeAttendanceStats,
};
