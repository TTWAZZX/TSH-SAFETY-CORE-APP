// backend/migrate-passwords.js
// รัน 1 ครั้งเพื่อ hash รหัสผ่านของพนักงานทุกคน
// ค่าเริ่มต้น: รหัสผ่าน = 123456
//
// วิธีใช้:
//   node backend/migrate-passwords.js
//
require('dotenv').config({ path: __dirname + '/.env' });
const bcrypt = require('bcryptjs');
const pool   = require('./db');

async function migratePasswords() {
    console.log('🔐 เริ่ม Migration: Hash passwords สำหรับพนักงานทุกคน...\n');

    try {
        // ดึงเฉพาะพนักงานที่ยังไม่มี Password hash
        const [employees] = await pool.query(
            'SELECT EmployeeID FROM Employees WHERE Password IS NULL'
        );

        if (employees.length === 0) {
            console.log('✅ พนักงานทุกคนมี Password แล้ว ไม่ต้องทำอะไร');
            process.exit(0);
        }

        console.log(`พบพนักงาน ${employees.length} คนที่ต้อง migrate\n`);

        const SALT_ROUNDS = 10;
        let success = 0;
        let failed  = 0;

        for (const emp of employees) {
            try {
                // รหัสผ่านเริ่มต้น = 123456
                const hashed = await bcrypt.hash('123456', SALT_ROUNDS);
                await pool.query(
                    'UPDATE Employees SET Password = ? WHERE EmployeeID = ?',
                    [hashed, emp.EmployeeID]
                );
                console.log(`  ✅ ${emp.EmployeeID}`);
                success++;
            } catch (err) {
                console.error(`  ❌ ${emp.EmployeeID}: ${err.message}`);
                failed++;
            }
        }

        console.log(`\n=============================`);
        console.log(`✅ สำเร็จ: ${success} คน`);
        if (failed > 0) {
            console.log(`❌ ล้มเหลว: ${failed} คน`);
        }
        console.log(`\n💡 รหัสผ่านเริ่มต้นของทุกคน = 123456`);
        console.log(`   พนักงานควรเปลี่ยนรหัสผ่านหลัง Login ครั้งแรก`);

    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

migratePasswords();
