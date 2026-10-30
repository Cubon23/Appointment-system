const test = require('node:test');
const assert = require('node:assert');
const { csvCell, buildCsv, facultyReportCsv, sharedReportCsv } = require('./csvExport');
const { buildFacultyAnalytics } = require('./facultyAnalytics');
const { buildSharedReport } = require('./reportMetrics');

test('text that could run as a formula is kept as text', () => {
  for (const evil of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\t=x', '\r=x']) {
    assert.ok(csvCell(evil).replace(/^"/, '').startsWith("'"), evil);
  }
  assert.strictEqual(csvCell('Ana Cruz'), 'Ana Cruz');
});

test('numbers are not prefixed, blanks are empty, commas and quotes are escaped', () => {
  assert.strictEqual(csvCell(-5), '-5');
  assert.strictEqual(csvCell(0), '0');
  assert.strictEqual(csvCell(null), '');
  assert.strictEqual(csvCell(NaN), '');
  assert.strictEqual(csvCell('a,b'), '"a,b"');
  assert.strictEqual(csvCell('say "hi"'), '"say ""hi"""');
  assert.strictEqual(csvCell('two\nlines'), '"two\nlines"');
});

test('buildCsv adds a BOM, CRLF line ends and blank lines between sections', () => {
  const out = buildCsv([{ title: 'A', header: ['x', 'y'], rows: [[1, 'b']] }, { title: 'B', rows: [['z']] }]);
  assert.strictEqual(out.charCodeAt(0), 0xFEFF);
  assert.strictEqual(out.slice(1), 'A\r\nx,y\r\n1,b\r\n\r\nB\r\nz\r\n');
});

test('a student named with a formula cannot reach the faculty or shared export as a live formula', () => {
  const apt = (status, name) => ({ status, date: '2026-10-20', time: '09:00', studentId: name, studentName: name, studentSection: 'BS INFO 3A', reason: '=HYPERLINK("http://x")', facultyId: 'f1' });
  const appointments = [apt('COMPLETED', '=EVIL()')];
  const fac = facultyReportCsv(buildFacultyAnalytics({ appointments, todayIso: '2026-10-28' }), { generatedAt: 'now', name: '=Faculty' });
  assert.ok(fac.includes("'=Faculty"));
  assert.ok(fac.toLowerCase().includes("'=hyperlink")); // purposes are re-cased by the report
  assert.ok(!/(^|\r\n|,)=/.test(fac));
  const shared = sharedReportCsv(buildSharedReport({ appointments, users: [{ _id: 'f1', role: 'FACULTY', accountStatus: 'ACTIVE', name: '+Dean' }], todayIso: '2026-10-28', includeAccountHealth: true }), { generatedAt: 'now', role: 'ADMIN' });
  assert.ok(shared.includes("'+Dean"));
  assert.ok(shared.includes('Profile completion'));
});
