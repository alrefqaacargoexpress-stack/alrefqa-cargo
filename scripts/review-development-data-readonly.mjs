import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.argv[2] ?? '/home/ubuntu/alrefqa-private-review');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const iso = value => value instanceof Date ? value.toISOString() : value ?? null;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' && !(value instanceof Date) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const identifier = value => {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error('Invalid database identifier');
  return '`' + value + '`';
};
const escapeMd = value => String(value ?? '—').replace(/[|\r\n]/g, ' ');
const maskPhone = value => value ? '…' + String(value).replace(/\D/g, '').slice(-4) : 'غير مسجل';
const publicNames = { shipment: 'شحنة', account: 'حساب عميل', invoice: 'فاتورة' };
let connection;
try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is unavailable');
  connection = await mysql.createConnection(process.env.DATABASE_URL);
  const query = async sql => {
    if (!/^(SELECT|SHOW)\s/i.test(sql) || sql.includes(';')) throw new Error('Only a single read-only SELECT/SHOW is permitted');
    return (await connection.query(sql))[0];
  };
  // Transaction control is not an application-data write. Every data statement
  // passes the SELECT/SHOW allowlist above, including on compatibility servers.
  let readonlyTransaction = true;
  try { await connection.query('START TRANSACTION READ ONLY'); }
  catch { readonlyTransaction = false; await connection.beginTransaction(); }
  const tables = (await query('SHOW TABLES')).map(row => Object.values(row)[0]).sort();
  const fingerprint = {};
  for (const table of tables) {
    const columns = (await query('SHOW COLUMNS FROM ' + identifier(table))).map(row => row.Field).filter(name => !/password|token|secret|openId/i.test(name));
    const count = Number((await query('SELECT COUNT(*) AS n FROM ' + identifier(table)))[0].n);
    if (count > 20000) throw new Error('Review requires pagination for table: ' + table);
    const rows = columns.length ? await query('SELECT ' + columns.map(identifier).join(', ') + ' FROM ' + identifier(table)) : [];
    const rowHashes = rows.map(row => hash(canonical(row))).sort();
    fingerprint[table] = { count, sha256: hash(rowHashes), credentialColumnsExcluded: true };
  }
  const records = await query('SELECT id, entity, recordId, version, data, createdAt, updatedAt, updatedBy FROM records ORDER BY id');
  const events = await query('SELECT entity, recordId, action, actorId, role, createdAt FROM audit_events ORDER BY sequence');
  const lifecycle = await query('SELECT entity, recordId, action, officeId, createdAt FROM entity_lifecycle');
  const entries = await query('SELECT id, kind, officeId, currency, shipmentId, invoiceId, actorId, data, createdAt FROM finance_entries ORDER BY id');
  const claims = await query('SELECT shipmentId, goodsId, invoiceId FROM finance_goods');
  const memberships = await query('SELECT userId, role, offices, homeOffice, version FROM member_roles ORDER BY userId');
  const rows = records.map(row => {
    const data = parse(row.data);
    const goods = (data.packing?.cartons ?? []).flatMap(carton => carton.goods.map(good => ({ id: good.id, name: good.name, phoneMasked: maskPhone(good.phone), pieces: good.pieces, unitWeight: good.unitWeight, retired: Boolean(good.deleted) })));
    const relatedEvents = events.filter(event => event.entity === row.entity && event.recordId === row.recordId);
    return {
      entity: row.entity, id: row.recordId, tracking: data.tracking ?? null, name: data.name ?? null,
      office: data.officeId ?? data.packing?.source ?? null, status: data.status ?? null, version: row.version,
      createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt), lastActorId: row.updatedBy,
      retired: Boolean(data.deleted) || lifecycle.some(event => event.entity === row.entity && event.recordId === row.recordId),
      financialEntryIds: entries.filter(entry => entry.shipmentId === row.recordId || entry.invoiceId === row.recordId || parse(entry.data)?.customerId === row.recordId).map(entry => entry.id),
      invoicedGoods: claims.filter(claim => claim.shipmentId === row.recordId),
      goods,
      auditEvidence: relatedEvents.map(event => ({ action: event.action, actorId: event.actorId, role: event.role, at: iso(event.createdAt) })),
      assessment: 'غير مؤكد: لا دليل يثبت أن السجل أُدخل للتجربة؛ يلزم تحديد المالك قبل استهدافه',
      approvedForDeletion: false,
    };
  });
  const financial = entries.map(entry => ({ id: entry.id, kind: entry.kind, officeId: entry.officeId, currency: entry.currency, shipmentId: entry.shipmentId, invoiceId: entry.invoiceId, actorId: entry.actorId, createdAt: iso(entry.createdAt), amount: parse(entry.data)?.amount ?? null, assessment: 'غير معتمد للحذف' }));
  const result = { generatedAt: new Date().toISOString(), readonlyTransaction, dataWrites: 0, deletionsApproved: 0, records: rows, financialEntries: financial, legacyTrackingMemberships: memberships.filter(member => member.role === 'tracking_staff'), tables: fingerprint, limitations: ['لا يمكن فصل إدخال المساعد عن إدخال المالك اعتمادًا على هوية المستخدم أو التاريخ وحدهما.', 'لا تشمل هذه المعاينة المسودات المخزنة في هاتف المالك أو هواتف الموظفين.', 'البصمات دليل مقارنة وليست نسخة احتياطية أو موافقة حذف.'] };
  await connection.rollback();
  await mkdir(output, { recursive: true, mode: 0o700 });
  await chmod(output, 0o700);
  const jsonPath = resolve(output, 'development-data-review.json');
  const markdownPath = resolve(output, 'development-data-review-ar.md');
  const lines = [
    '# قائمة مراجعة بيانات الرفكة — قراءة فقط', '',
    '**لا توجد موافقة لحذف أي عنصر في هذه القائمة، ولم يُحذف أو يُعدّل سجل.**', '',
    `التوقيت: ${result.generatedAt}. قاعدة بيانات المشروع مشتركة مع الموقع المنشور.`, '',
    `عدد السجلات التشغيلية: ${rows.length}. عدد القيود المالية: ${financial.length}. عدد عضويات موظف التتبع القديمة: ${result.legacyTrackingMemberships.length}.`, '',
    '## الشحنات وحسابات العملاء والفواتير', '',
    '| النوع | المعرف | رقم الشحنة / اسم الحساب | المكتب | الحالة | النسخة | تاريخ الإنشاء | الوضع |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => `| ${publicNames[row.entity] ?? row.entity} | ${escapeMd(row.id)} | ${escapeMd(row.tracking ?? row.name)} | ${escapeMd(row.office)} | ${escapeMd(row.status)} | ${row.version} | ${escapeMd(row.createdAt)} | ${row.retired ? 'متقاعد بالفعل؛ لا يستعاد' : 'محفوظ؛ يحتاج قرار المالك'} |`),
    '',
    '## البضاعة المرتبطة بالشحنات', '',
    '| رقم الشحنة | معرف البضاعة | الاسم / الماركة | آخر أرقام الهاتف | القطع | وزن القطعة |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.flatMap(row => row.goods.map(good => `| ${escapeMd(row.tracking)} | ${escapeMd(good.id)} | ${escapeMd(good.name)} | ${escapeMd(good.phoneMasked)} | ${good.pieces} | ${good.unitWeight} |`)),
    '',
    '## الأثر المالي ودليل الإدخال', '',
    ...rows.map(row => `- السجل ${escapeMd(row.id)}: ${row.financialEntryIds.length} قيد مالي مرتبط، و${row.invoicedGoods.length} مطالبة بضاعة مفوترة، و${row.auditEvidence.length} حدث تدقيق مطابق. آخر معرف منفذ ${row.lastActorId} لا يثبت وحده أن الإدخال تجريبي.`),
    '',
    financial.length ? 'توجد قيود مالية: تُراجع معرفاتها وروابطها في ملف البيانات الخاص قبل أي إلغاء، ولا تُمحى مباشرة.' : 'لا توجد قيود مالية محفوظة في finance_entries عند هذه القراءة. هذا لا يعني أن قيمة البضائع أو السعر المعلن صفر، ولا يجيز حذفها.',
    '',
    '## القرار المطلوب', '',
    'حدّد أرقام الشحنات أو معرفات الحسابات التجريبية المقصودة في الجدول، أو اختر الاحتفاظ بها جميعًا. كل السجلات غير مؤكدة المصدر ومحمية حتى قرارك. لا تشمل هذه المعاينة بيانات هاتفك المحلية، ولا تفترض أن وجود قيمة في شحنة يعني قبضًا نقديًا. الحذف الفعلي يحتاج قائمة نهائية وأثرًا معتمدًا ونسخة خاصة للسجلات وروابطها أولًا.', '',
    'ملف JSON المصاحب يتضمن الروابط ودليل التدقيق المختصر وبصمات الجداول، دون كلمات مرور أو رموز جلسات أو هواتف كاملة. البصمات ليست نسخة استعادة.', '',
  ];
  await writeFile(jsonPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  await writeFile(markdownPath, lines.join('\n'), { mode: 0o600 });
  console.log(JSON.stringify({ report: markdownPath, supportingData: jsonPath, records: rows.length, financeEntries: financial.length, trackingStaffMemberships: result.legacyTrackingMemberships.length, dataWrites: 0 }));
} catch (error) {
  console.error('Read-only review stopped: ' + error.message);
  process.exitCode = 1;
} finally {
  if (connection) await connection.end();
}
