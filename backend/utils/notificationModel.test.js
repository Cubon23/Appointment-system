const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');

// validateSync checks the schema rules without needing a database connection
const make = (link) => new Notification({
  userId: new mongoose.Types.ObjectId(), type: 'APPOINTMENT_UPDATE', title: 't', message: 'm', ...(link === undefined ? {} : { link }),
});

test('Notification model: a safe link, no link, and null are all accepted', () => {
  const id = new mongoose.Types.ObjectId().toString();
  assert.equal(make(`/student-dashboard?page=requests&apt=${id}`).validateSync(), undefined);
  assert.equal(make().validateSync(), undefined);
  assert.equal(make(null).validateSync(), undefined);
  assert.equal(make().link, null);
});

test('Notification model: a link that points anywhere else cannot be saved', () => {
  for (const bad of ['https://evil.com', '//evil.com', 'javascript:alert(1)', '/student-dashboard?page=requests&apt=x', '/somewhere-else']) {
    const err = make(bad).validateSync();
    assert.ok(err && err.errors.link, bad);
  }
});
