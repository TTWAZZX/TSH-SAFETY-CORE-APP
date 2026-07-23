const db = require('../db');

const EMAIL_REQUIREMENT_SETTING_KEY = 'employee_email_required_positions';
const DEFAULT_EMAIL_REQUIRED_POSITION_NAMES = [
    'ประธานกิตติมศักดิ์',
    'ผู้จัดการ',
    'ผู้จัดการทั่วไป',
    'ผู้ชำนาญการพิเศษ',
    'ผู้ช่วยผู้จัดการทั่วไป',
    'ผู้อำนวยการสายธุรกิจ Wiring Harness',
    'รักษาการผู้จัดการ',
    'หัวหน้าส่วน',
    'หัวหน้าแผนก',
];

async function ensureAppSettingsTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS App_Settings (
            key_name  VARCHAR(100) PRIMARY KEY,
            value     TEXT,
            UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
}

function parseEmailRequirementSetting(rawValue) {
    if (!rawValue) return [];
    try {
        const parsed = JSON.parse(rawValue);
        const ids = Array.isArray(parsed) ? parsed : parsed?.positionIds;
        return Array.isArray(ids)
            ? [...new Set(ids.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))]
            : [];
    } catch (_) {
        return [];
    }
}

async function getEmailRequirementRule({ ensureSchema = true } = {}) {
    if (ensureSchema) await ensureAppSettingsTable();
    const [positions] = await db.query('SELECT id, Name FROM Master_Positions ORDER BY Name ASC');
    let settings = [];
    try {
        [settings] = await db.query('SELECT value FROM App_Settings WHERE key_name = ? LIMIT 1', [EMAIL_REQUIREMENT_SETTING_KEY]);
    } catch (error) {
        if (ensureSchema) throw error;
    }
    const availableIds = new Set(positions.map(position => Number(position.id)));
    const storedIds = parseEmailRequirementSetting(settings[0]?.value).filter(id => availableIds.has(id));
    const seededIds = positions
        .filter(position => DEFAULT_EMAIL_REQUIRED_POSITION_NAMES.includes(position.Name))
        .map(position => Number(position.id));
    return {
        positions,
        requiredPositionIds: settings.length ? storedIds : seededIds,
        isUsingDefault: !settings.length,
    };
}

module.exports = {
    EMAIL_REQUIREMENT_SETTING_KEY,
    DEFAULT_EMAIL_REQUIRED_POSITION_NAMES,
    ensureAppSettingsTable,
    parseEmailRequirementSetting,
    getEmailRequirementRule,
};
