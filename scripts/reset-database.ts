import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ خطأ: لم يتم العثور على NEON_DATABASE_URL في متغيرات البيئة.');
  process.exit(1);
}

const sqlConnection = neon(databaseUrl);
const db = drizzle(sqlConnection);

// حساب المالك المستثنى بشكل صريح من عملية المسح
const OWNER_EMAIL = 'alrefqaa.cargo.express@gmail.com';

async function runCleanReset() {
  console.log('🚀 بدء عملية البداية النظيفة (Reset)...');

  try {
    // 1. جلب ID الخاص بحساب المالك للحفاظ عليه
    const ownerResult = await db.execute(
      sql`SELECT id FROM users WHERE email = ${OWNER_EMAIL} LIMIT 1;`
    );

    const ownerId = ownerResult.rows?.[0]?.id;

    if (!ownerId) {
      console.warn(`⚠️ تحذير: لم يتم العثور على حساب المالك (${OWNER_EMAIL}). سيتم إكمال التصفير بحذر.`);
    } else {
      console.log(`✅ تم التعرف على حساب المالك (ID: ${ownerId}) ولن يتم حذفه.`);
    }

    // 2. قائمة الجداول التشغيلية والمالية المراد تصفيرها بالكامل
    const tablesToTruncate = [
      'audit_events',
      'audit_heads',
      'cash_movements',
      'cash_register_locks',
      'cash_registers',
      'customer_shipment_access',
      'duty_events',
      'email_enrollments',
      'entity_lifecycle',
      'finance_entries',
      'finance_goods',
      'finance_receipts',
      'finance_reversals',
      'invoice_adjustments',
      'local_sessions',
      'member_roles',
      'office_delegation_policies',
      'office_payment_settings',
      'office_profiles',
      'office_settings',
      'office_tariff_history',
      'permission_delegations',
      'record_keys',
      'records',
      'shipment_charge_allocations',
      'shipment_charge_components',
      'shipment_cost_approvals',
      'shipment_price_overrides',
      'shipment_tariff_snapshots',
      'shipment_tracking_events',
      'sync_receipts',
      'wallet_movements',
      'warehouse_location_events',
    ];

    console.log('🧹 تفريغ الجداول التشغيلية والتاريخية...');
    for (const table of tablesToTruncate) {
      await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE;`));
    }

    // 3. حذف جميع المستخدمين باستثناء حساب المالك الرئيسي
    if (ownerId) {
      console.log('👤 حذف باقي حسابات المستخدمين مع الإبقاء على المالك فقط...');
      await db.execute(sql`DELETE FROM users WHERE id != ${ownerId};`);
    } else {
      await db.execute(sql`DELETE FROM users WHERE email != ${OWNER_EMAIL};`);
    }

    // 4. إنشاء سجل البداية النظيفة في التدقيق لإعادة ضبط النظام
    console.log('📝 تسجيل حدث البداية النظيفة...');
    await db.execute(sql`
      INSERT INTO audit_events (
        id, entity_type, entity_id, action, actor_id, actor_name, details, created_at
      ) VALUES (
        gen_random_uuid(),
        'system',
        'clean_reset',
        'SYSTEM_RESET',
        ${ownerId || 'system'},
        'System Owner',
        '{"message": "Clean reset performed successfully"}',
        NOW()
      );
    `);

    console.log('🎉 اكتملت عملية البداية النظيفة بنجاح! قاعدة البيانات جاهزة الآن للعمليات الجديدة.');
  } catch (error) {
    console.error('❌ حدث خطأ أثناء تنفيذ عملية التصفير:', error);
    process.exit(1);
  }
}

runCleanReset();
