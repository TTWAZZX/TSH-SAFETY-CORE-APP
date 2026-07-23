const db = require('../db');
const { resolveTopicUnitScope } = require('../utils/yokoten-admin-scope');

function scopeList(value) {
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(String(value || ''));
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

async function main() {
    const [departments] = await db.query(
        'SELECT id, TRIM(Name) AS name FROM master_departments ORDER BY id'
    );
    const [units] = await db.query(
        `SELECT u.id, TRIM(u.name) AS name, TRIM(COALESCE(u.short_code, '')) AS shortCode, u.department_id,
                TRIM(COALESCE(d.Name, '')) AS department
         FROM master_safetyunits u
         LEFT JOIN master_departments d ON d.id = u.department_id
         ORDER BY u.department_id, u.id`
    );
    const [topics] = await db.query(
        `SELECT YokotenID, Title, TargetDepts, TargetUnits, IsActive
         FROM YokotenTopics
         WHERE IsActive = 1
         ORDER BY DateIssued DESC
         LIMIT 5`
    );
    const [safetyUnitColumn] = await db.query(
        "SHOW COLUMNS FROM YokotenResponses LIKE 'SafetyUnit'"
    );

    const unknownUnits = units.filter(unit => !unit.department);
    const duplicateUnitNames = [...units.reduce((groups, unit) => {
        const key = unit.name.toLocaleLowerCase();
        groups.set(key, (groups.get(key) || 0) + 1);
        return groups;
    }, new Map()).entries()].filter(([, count]) => count > 1);
    const activeTopicScopeHealth = topics.map(topic => {
        const resolution = resolveTopicUnitScope(scopeList(topic.TargetUnits), units);
        const lengthsByDepartment = {};
        resolution.units.forEach(unit => {
            if (!lengthsByDepartment[unit.department]) lengthsByDepartment[unit.department] = [];
            lengthsByDepartment[unit.department].push(unit.name);
        });
        const storageOverflows = Object.entries(lengthsByDepartment)
            .filter(([, names]) => names.join(', ').length > 100)
            .map(([department, names]) => ({
                department,
                length: names.join(', ').length,
            }));
        return {
            yokotenId: topic.YokotenID,
            unresolved: resolution.unresolved,
            aliases: resolution.aliases,
            storageOverflows,
        };
    });

    console.log(JSON.stringify({
        departmentCount: departments.length,
        unitCount: units.length,
        unknownUnitDepartmentCount: unknownUnits.length,
        duplicateUnitNames,
        safetyUnitColumn: safetyUnitColumn[0] || null,
        departments,
        units,
        activeTopics: topics,
        activeTopicScopeHealth,
    }, null, 2));
}

main()
    .catch(error => {
        console.error(error.message || error);
        process.exitCode = 1;
    })
    .finally(() => db.end());
