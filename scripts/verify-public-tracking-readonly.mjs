// A read-only integration check. Never print phone, names or tracking numbers.
import mysql from 'mysql2/promise';
import assert from 'node:assert/strict';
const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [rows] = await connection.execute("SELECT data FROM records WHERE entity='shipment'");
  let selected;
  for (const row of rows) {
    const shipment = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    if (shipment.deleted) continue;
    for (const carton of shipment.packing?.cartons ?? []) {
      for (const goods of carton.goods) {
        if (!goods.deleted && /^\+?[\d ()\-.]{7,64}$/.test(goods.phone ?? '')) {
          selected = { shipment, goods };
          break;
        }
      }
      if (selected) break;
    }
    if (selected) break;
  }
  if (!selected) {
    console.log(JSON.stringify({ checked: false, reason: 'No eligible saved cargo phone', noBusinessWrite: true }));
  } else {
    const request = await fetch('http://127.0.0.1:3000/api/trpc/publicTracking.lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { tracking: selected.shipment.tracking, phone: selected.goods.phone } }),
    });
    assert.equal(request.status, 200, 'Public read-only request failed');
    const envelope = await request.json();
    const result = envelope.result?.data?.json;
    assert.equal(result?.found, true, 'Expected an existing shared cargo match');
    for (const field of ['amount', 'account', 'pricePerKg', 'pricePerKgMRU', 'route', 'eta', 'journey', 'notes', 'id', 'version', 'officeId']) {
      assert.ok(!(field in result.shipment), 'Unexpected private field');
    }
    assert.equal(request.headers.get('cache-control'), 'no-store');
    console.log(JSON.stringify({ checked: true, liveSharedCargoFound: true, privateFieldsExcluded: true, noStore: true, noBusinessWrite: true }));
  }
} finally {
  await connection.end();
}
