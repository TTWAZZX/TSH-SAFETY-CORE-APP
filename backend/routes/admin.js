// backend/routes/admin.js
// Auth (authenticateToken + isAdmin) applied at mount level in server.js
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const xlsx     = require('xlsx');
const bcrypt   = require('bcryptjs');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const db       = require('../db');
const { uploadsDir } = require('../storage');
const { ensureAuditTable } = require('../utils/audit');
const {
    getCoverageMatrix,
    getMergedTargets,
    getDynamicActivityRatio,
    ACTIVITIES,
} = require('./activity-targets');
const {
    validateCompanyEmail,
    ensureEmployeeCompanyEmailColumn,
} = require('../utils/company-email');
const { getCccfWorkerProgress } = require('../utils/cccf-worker-progress');
const { sendMail, smtpConfigured } = require('../utils/email');
const { registrationEmailTemplate } = require('../utils/registration-email-template');
const { ProfileValidationError } = require('../utils/profile-validator');
const { buildKySafetyCoreCountMap } = require('../utils/safety-core-ky');
const {
    CROSS_PATH_OPERATION,
    executeEmployeeProfileWrite,
    writeEmployeeProfileWithinTransaction,
} = require('../services/employee-profile-write');
const patrolRoutes = require('./patrol');
const upload = multer({ storage: multer.memoryStorage() });

// ─── Constants ────────────────────────────────────────────────────────────────
const ALLOWED_ROLES = ['Admin', 'User', 'Viewer'];
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

async function getEmailRequirementRule() {
    await ensureAppSettingsTable();
    const [positions] = await db.query('SELECT id, Name FROM Master_Positions ORDER BY Name ASC');
    const [settings] = await db.query('SELECT value FROM App_Settings WHERE key_name = ? LIMIT 1', [EMAIL_REQUIREMENT_SETTING_KEY]);
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

async function getEmailReadinessData() {
    await ensureEmployeeCompanyEmailColumn(db);
    const rule = await getEmailRequirementRule();
    const requiredIds = new Set(rule.requiredPositionIds.map(Number));
    const requiredNames = new Set(
        rule.positions
            .filter(position => requiredIds.has(Number(position.id)))
            .map(position => String(position.Name || '').trim())
            .filter(Boolean)
    );
    const [employees] = await db.query(
        `SELECT EmployeeID, EmployeeName, Department, Unit, Position, CompanyEmail
         FROM Employees
         ORDER BY Department, Position, EmployeeName`
    );
    const rows = employees.map(employee => {
        const position = String(employee.Position || '').trim();
        const companyEmail = String(employee.CompanyEmail || '').trim().toLowerCase();
        const emailCheck = validateCompanyEmail(companyEmail);
        const required = requiredNames.has(position);
        let status = 'optional';
        if (companyEmail && !emailCheck.ok) status = 'invalid_domain';
        else if (required && !companyEmail) status = 'missing_required';
        else if (companyEmail) status = 'ready';
        return {
            ...employee,
            CompanyEmail: companyEmail || null,
            IsEmailRequired: required,
            EmailReadinessStatus: status,
        };
    });
    const requiredRows = rows.filter(row => row.IsEmailRequired);
    return {
        summary: {
            totalEmployees: rows.length,
            requiredEmployees: requiredRows.length,
            readyRequired: requiredRows.filter(row => row.EmailReadinessStatus === 'ready').length,
            missingRequired: requiredRows.filter(row => row.EmailReadinessStatus === 'missing_required').length,
            invalidDomain: rows.filter(row => row.EmailReadinessStatus === 'invalid_domain').length,
        },
        rule: {
            requiredPositionIds: rule.requiredPositionIds,
            requiredPositions: rule.positions.filter(position => requiredIds.has(Number(position.id))),
            isUsingDefault: rule.isUsingDefault,
        },
        rows,
    };
}

function crossPathErrorResponse(res, error, fallbackMessage) {
    if (error instanceof ProfileValidationError) {
        return res.status(error.httpStatus).json({
            success: false,
            code: error.code,
            message: error.message,
        });
    }
    return res.status(500).json({ success: false, message: fallbackMessage });
}

function partialProfilePayload(body) {
    return Object.fromEntries(
        ['EmployeeName', 'Department', 'Unit', 'Position']
            .filter(field => Object.prototype.hasOwnProperty.call(body || {}, field))
            .map(field => [field, body[field]])
    );
}

function partialProtectedFields(body, email) {
    const fields = {};
    if (Object.prototype.hasOwnProperty.call(body || {}, 'Team')) fields.Team = String(body.Team ?? '').trim();
    if (Object.prototype.hasOwnProperty.call(body || {}, 'CompanyEmail')) fields.CompanyEmail = email;
    if (Object.prototype.hasOwnProperty.call(body || {}, 'Role')) {
        fields.Role = ALLOWED_ROLES.includes(body.Role) ? body.Role : 'User';
    }
    return fields;
}
async function getEmailReadinessData() {
    const rule = await getEmailRequirementRule({ ensureSchema: false });
    const requiredIds = new Set(rule.requiredPositionIds.map(Number));
    const requiredNames = new Set(
        rule.positions
            .filter(position => requiredIds.has(Number(position.id)))
            .map(position => String(position.Name || '').trim())
            .filter(Boolean)
    );
    const [employees] = await db.query(
        `SELECT EmployeeID, EmployeeName, Department, Unit, Position, CompanyEmail
         FROM Employees
         ORDER BY Department, Position, EmployeeName`
    );
    const rows = employees.map(employee => {
        const position = String(employee.Position || '').trim();
        const companyEmail = String(employee.CompanyEmail || '').trim().toLowerCase();
        const emailCheck = validateCompanyEmail(companyEmail);
        const required = requiredNames.has(position);
        let status = 'optional';
        if (companyEmail && !emailCheck.ok) status = 'invalid_domain';
        else if (required && !companyEmail) status = 'missing_required';
        else if (companyEmail) status = 'ready';
        return {
            ...employee,
            CompanyEmail: companyEmail || null,
            IsEmailRequired: required,
            EmailReadinessStatus: status,
        };
    });
    const requiredRows = rows.filter(row => row.IsEmailRequired);
    return {
        summary: {
            totalEmployees: rows.length,
            requiredEmployees: requiredRows.length,
            readyRequired: requiredRows.filter(row => row.EmailReadinessStatus === 'ready').length,
            missingRequired: requiredRows.filter(row => row.EmailReadinessStatus === 'missing_required').length,
            invalidDomain: rows.filter(row => row.EmailReadinessStatus === 'invalid_domain').length,
        },
        rule: {
            requiredPositionIds: rule.requiredPositionIds,
            requiredPositions: rule.positions.filter(position => requiredIds.has(Number(position.id))),
            isUsingDefault: rule.isUsingDefault,
        },
        rows,
    };
}

const SYSTEM_HEALTH_MODULES = [
    { key: 'core', label: 'Core Master', group: 'platform', nav: 'employees', tables: ['Employees', 'Master_Departments', 'Master_Teams', 'Master_Positions', 'Master_Areas', 'App_Settings'], columns: { Employees: ['EmployeeID', 'EmployeeName', 'Department', 'Position', 'Role'] }, api: ['/api/master/departments', '/api/admin/employees'] },
    { key: 'admin', label: 'System Console', group: 'platform', nav: 'admin', tables: ['Admin_AuditLogs', 'Admin_RolePermissions', 'Admin_UserPermissions', 'Safety_Core_Export_Roster'], columns: { Admin_AuditLogs: ['Module', 'Path', 'StatusCode', 'ActionTime'] }, api: ['/api/admin/system-health', '/api/admin/audit-logs', '/api/admin/safety-core-data'] },
    { key: 'registration', label: 'Account Registration', group: 'platform', nav: 'admin', tables: ['registration_requests'], columns: { registration_requests: ['ReferenceCode', 'EmployeeID', 'Status', 'SubmittedAt', 'StatusViewCount'] }, api: ['/api/register/options', '/api/admin/registration-requests'] },
    { key: 'activity-targets', label: 'Activity Targets', group: 'platform', nav: 'admin', tables: ['Activity_Position_Templates', 'Activity_Scope_Overrides', 'Employee_Activity_Targets', 'Activity_Position_Template_Years', 'Activity_Scope_Override_Years', 'Employee_Activity_Target_Years'], api: ['/api/activity-targets/activities', '/api/activity-targets/coverage-matrix', '/api/activity-targets/me'] },
    { key: 'dashboard', label: 'Dashboard', group: 'platform', nav: 'dashboard', tables: ['Dashboard_Config'], api: ['/api/dashboard/overview', '/api/dashboard/config'] },
    { key: 'module-forms', label: 'Module Forms', group: 'platform', nav: 'admin', tables: ['Module_Forms'], api: ['/api/module-forms?module=hiyari'] },
    { key: 'policy', label: 'Policy', group: 'content', nav: 'policy', tables: ['Policies'], api: ['/api/pagedata/policies'] },
    { key: 'committee', label: 'Committee', group: 'content', nav: 'committee', tables: ['Committees'], api: ['/api/pagedata/committees'] },
    { key: 'kpi', label: 'KPI', group: 'content', nav: 'kpi', tables: ['KPIAnnouncements', 'KPIData'], api: ['/api/pagedata/kpi-announcements', '/api/kpidata/2026'] },
    { key: 'patrol', label: 'Safety Patrol', group: 'workflow', nav: 'patrol', tables: ['Patrol_Sessions', 'Patrol_Issues', 'Patrol_Roster', 'Patrol_Leave_Requests', 'Patrol_EmailOutbox', 'Patrol_RankA_Hotspot_Positions', 'Patrol_RankA_Hotspot_Issue_Positions'], api: ['/api/patrol/dashboard-stats', '/api/patrol/issues', '/api/patrol/roster'] },
    { key: 'cccf', label: 'CCCF Activity', group: 'workflow', nav: 'cccf', tables: ['CCCF_Activity', 'CCCF_FormA_Worker', 'CCCF_FormA_Permanent', 'CCCF_Unit_Targets', 'cccf_worker_attachments', 'cccf_permanent_sequences', 'cccf_assignments', 'cccf_emailoutbox'], columns: { CCCF_FormA_Worker: ['SafetyUnit', 'SubmitDate'], CCCF_FormA_Permanent: ['PermanentNo', 'ReviewStatus'] }, api: ['/api/cccf/form-a-worker', '/api/cccf/form-a-permanent', '/api/cccf/unit-targets'] },
    { key: 'hiyari', label: 'Hiyari-Hatto', group: 'workflow', nav: 'hiyari', tables: ['HiyariReports', 'Hiyari_Dashboard_Config', 'Hiyari_Assignments', 'Hiyari_EmailOutbox'], api: ['/api/hiyari/stats', '/api/hiyari/dashboard-config'] },
    { key: 'ky', label: 'KY Activity', group: 'workflow', nav: 'ky', tables: ['KY_Activities', 'KY_Program_Config', 'KY_Video_Reactions', 'KY_EmailOutbox'], api: ['/api/ky/stats', '/api/ky/program-config'] },
    { key: 'fourm', label: '4M Change', group: 'workflow', nav: 'fourm', tables: ['FourM_ChangeNotices', 'FourM_ManRecords', 'FourM_ActionTasks', 'FourM_EmailOutbox', 'FourM_Curriculums', 'FourM_CourseMaster', 'FourM_Courses', 'FourM_CourseEmployees', 'FourM_CurriculumEmployees', 'FourM_CurriculumLogs'], api: ['/api/fourm/stats', '/api/fourm/notices', '/api/fourm/man-records'] },
    { key: 'training', label: 'Safety Training', group: 'workflow', nav: 'training', tables: ['Training_Courses', 'Training_Records', 'Training_Dept_Records', 'Training_Audit_Requirements'], api: ['/api/training/courses', '/api/training/summary', '/api/training/records'] },
    { key: 'ojt', label: 'OJT / SCW', group: 'workflow', nav: 'ojt', tables: ['SCW_Standard', 'OJT_Records', 'OJT_History', 'SCW_Documents', 'ojt_settings'], api: ['/api/ojt/standard', '/api/ojt/records', '/api/ojt/documents'] },
    { key: 'forklift', label: 'Forklift License', group: 'operations', nav: 'forklift', tables: ['forklift_license_types', 'forklift_licenses', 'forklift_license_requests', 'forklift_license_renewals', 'forklift_license_documents', 'forklift_card_templates', 'forklift_card_template_versions', 'forklift_card_template_fields', 'forklift_card_template_type_map', 'forklift_card_print_logs', 'forklift_verification_tokens', 'Forklift_EmailOutbox', 'forklift_sequences', 'forklift_settings', 'forklift_employee_photos'], api: ['/api/forklift/dashboard', '/api/forklift/license-types', '/api/forklift/settings'] },
    { key: 'contractor', label: 'Contractor / Supplier', group: 'operations', nav: 'contractor', tables: ['Contractor_Documents', 'Contractor_Activity_Log', 'Contractor_Companies', 'Contractor_AccidentRecords', 'Contractor_AccidentFiles'], api: ['/api/contractor/documents', '/api/contractor/documents/stats', '/api/contractor/activity'] },
    { key: 'machine-safety', label: 'Machine Device', group: 'operations', nav: 'machine-safety', tables: ['Machine_Safety', 'Machine_Safety_Files', 'Machine_Safety_Compliance', 'Machine_Safety_Issues'], api: ['/api/machine-safety'] },
    { key: 'accident', label: 'Accident Reports', group: 'operations', nav: 'accident', tables: ['Accident_Reports', 'Accident_Attachments', 'Accident_Performance', 'Accident_Monthly_Reports', 'Accident_Hotspot_Positions'], api: ['/api/accident/reports', '/api/accident/summary', '/api/accident/analytics'] },
    { key: 'safety-culture', label: 'Safety Culture', group: 'operations', nav: 'safety-culture', tables: ['SC_Principles', 'SC_Assessments', 'SC_Assessment_Points', 'SC_Assessment_Locations', 'SC_PPE_Items', 'SC_PPE_WorkTypes', 'SC_PPE_WorkType_Items', 'SC_PPEInspections', 'SC_PPE_Inspection_Details', 'SC_PPE_Violations', 'SC_PPE_AuditLog'], api: ['/api/safety-culture/dashboard', '/api/safety-culture/principles', '/api/safety-culture/ppe-inspections'] },
    { key: 'yokoten', label: 'Yokoten', group: 'knowledge', nav: 'yokoten', tables: ['YokotenTopics', 'YokotenResponses', 'Yokoten_Response_Files', 'Yokoten_Dashboard_Config', 'Yokoten_EmailOutbox'], api: ['/api/yokoten/topics', '/api/yokoten/dashboard-config', '/api/yokoten/all-responses'] },
    { key: 'johnny', label: 'Johnny AI', group: 'knowledge', nav: 'johnny', tables: ['johnny_chat_conversations', 'johnny_chat_messages', 'johnny_kb_documents', 'johnny_kb_chunks', 'johnny_operational_logs'], api: ['/api/johnny/operational-logs', '/api/johnny/kb-documents'] },
    { key: 'settings', label: 'Settings', group: 'platform', nav: 'admin', tables: ['App_Settings'], api: ['/api/settings/public_upload_base_url'] },
];

function systemHealthModuleFromPath(path = '') {
    const clean = String(path || '').replace(/^\/api\//, '').split('?')[0];
    const first = clean.split('/')[0] || 'system';
    if (first === 'pagedata' || first === 'kpidata' || first === 'kpiannouncements') return 'kpi';
    return first;
}

function systemHealthTableRequirement(moduleKey, tableName) {
    const optional = {
        patrol: ['patrol_ranka_hotspot_positions', 'patrol_ranka_hotspot_issue_positions'],
        cccf: ['cccf_assignments', 'cccf_emailoutbox'],
        hiyari: ['hiyari_assignments', 'hiyari_emailoutbox'],
        ky: ['ky_video_reactions', 'ky_emailoutbox'],
        fourm: ['fourm_emailoutbox', 'fourm_coursemaster', 'fourm_courseemployees', 'fourm_curriculumlogs'],
        ojt: ['ojt_settings'],
        forklift: ['forklift_employee_photos'],
        contractor: ['contractor_activity_log'],
        yokoten: ['yokoten_emailoutbox'],
        johnny: ['johnny_operational_logs'],
    };
    const backlog = {
        core: ['master_areas'],
        contractor: ['contractor_companies', 'contractor_accidentrecords', 'contractor_accidentfiles'],
    };
    const name = String(tableName || '').toLowerCase();
    if ((backlog[moduleKey] || []).includes(name)) return 'backlog';
    if ((optional[moduleKey] || []).includes(name)) return 'optional';
    return 'required';
}

async function buildSystemHealthWorkflowRules() {
    const definitions = [
        { key: 'patrol_issue_overdue', module: 'patrol', label: 'Patrol issues open beyond SLA', slaDays: 14, severity: 'high', penalty: 8, sql: "SELECT COUNT(*) total FROM Patrol_Issues WHERE (CurrentStatus IS NULL OR CurrentStatus NOT IN ('Closed','Completed')) AND DATEDIFF(CURDATE(),COALESCE(DueDate,DateFound))>14" },
        { key: 'patrol_leave_pending', module: 'patrol', label: 'Patrol leave pending review', slaDays: 3, severity: 'medium', penalty: 4, sql: "SELECT COUNT(*) total FROM Patrol_Leave_Requests WHERE Status='Pending' AND DATEDIFF(CURDATE(),CreatedAt)>3" },
        { key: 'cccf_permanent_pending', module: 'cccf', label: 'CCCF Permanent pending review', slaDays: 7, severity: 'medium', penalty: 4, sql: "SELECT COUNT(*) total FROM CCCF_FormA_Permanent WHERE COALESCE(ReviewStatus,'Pending')='Pending' AND DATEDIFF(CURDATE(),COALESCE(SubmittedAt,CreatedAt))>7" },
        { key: 'cccf_unit_target_unset', module: 'cccf', label: 'CCCF active Units without yearly target', slaDays: 0, severity: 'low', penalty: 2, sql: "SELECT COUNT(*) total FROM Master_Teams t LEFT JOIN CCCF_Unit_Targets u ON LOWER(TRIM(u.SafetyUnit))=LOWER(TRIM(t.Name)) AND u.TargetYear=YEAR(CURDATE()) WHERE COALESCE(t.Name,'')<>'' AND u.id IS NULL" },
        { key: 'hiyari_stale', module: 'hiyari', label: 'Hiyari open beyond SLA', slaDays: 14, severity: 'medium', penalty: 4, sql: "SELECT COUNT(*) total FROM HiyariReports WHERE DeletedAt IS NULL AND Status!='Closed' AND DATEDIFF(CURDATE(),ReportDate)>14" },
        { key: 'fourm_stale', module: 'fourm', label: '4M Change open beyond SLA', slaDays: 30, severity: 'medium', penalty: 4, sql: "SELECT COUNT(*) total FROM FourM_ChangeNotices WHERE Status IN ('Open','Pending') AND DATEDIFF(CURDATE(),RequestDate)>30" },
        { key: 'forklift_expired', module: 'forklift', label: 'Active forklift licenses expired', slaDays: 0, severity: 'high', penalty: 8, sql: "SELECT COUNT(*) total FROM forklift_licenses WHERE ExpireDate<CURDATE() AND DeletedAt IS NULL AND UPPER(COALESCE(CurrentStatus,'ACTIVE')) NOT IN ('ARCHIVED','SUSPENDED')" },
        { key: 'forklift_request_pending', module: 'forklift', label: 'Forklift requests pending review', slaDays: 7, severity: 'medium', penalty: 4, sql: "SELECT COUNT(*) total FROM forklift_license_requests WHERE RequestStatus IN ('SUBMITTED','UNDER_REVIEW','PENDING') AND DATEDIFF(CURDATE(),COALESCE(SubmittedAt,RequestedAt))>COALESCE((SELECT CAST(SettingValue AS UNSIGNED) FROM forklift_settings WHERE SettingKey='request_sla_days' LIMIT 1),3)" },
        { key: 'training_expired', module: 'training', label: 'Training records expired', slaDays: 0, severity: 'medium', penalty: 4, sql: "SELECT COUNT(*) total FROM Training_Records WHERE ExpiryDate IS NOT NULL AND ExpiryDate<CURDATE()" },
        { key: 'contractor_docs_expired', module: 'contractor', label: 'Contractor documents expired', slaDays: 0, severity: 'high', penalty: 8, sql: "SELECT COUNT(*) total FROM Contractor_Documents WHERE ExpiryDate IS NOT NULL AND ExpiryDate<CURDATE()" },
        { key: 'accident_overdue', module: 'accident', label: 'Accident investigation/CAPA overdue', slaDays: 0, severity: 'high', penalty: 8, sql: "SELECT COUNT(*) total FROM Accident_Reports WHERE DueDate IS NOT NULL AND DueDate<CURDATE() AND Status!='Closed' AND (IsDeleted IS NULL OR IsDeleted=0)" },
        { key: 'safety_culture_pending', module: 'safety-culture', label: 'Safety Culture assessments pending', slaDays: 14, severity: 'medium', penalty: 4, sql: "SELECT COUNT(*) total FROM SC_Assessments WHERE COALESCE(Status,'Draft') NOT IN ('Completed','Closed') AND DATEDIFF(CURDATE(),CreatedAt)>14" },
    ];
    return Promise.all(definitions.map(async ({ sql, ...rule }) => {
        try {
            const [[row]] = await db.query(sql);
            return { ...rule, count: Number(row?.total || 0), available: true };
        } catch {
            return { ...rule, count: 0, available: false };
        }
    }));
}

async function buildSystemStorageHealth() {
    const uploadDirs = [uploadsDir, path.resolve(__dirname, '..', '..', 'uploads')];
    const sources = [
        { module: 'cccf', label: 'CCCF Worker', table: 'cccf_worker_attachments', id: 'id', url: 'FileUrl', where: 'IsDeleted=0' },
        { module: 'cccf', label: 'CCCF Permanent', table: 'cccf_forma_permanent', id: 'id', url: 'FileUrl' },
        { module: 'cccf', label: 'CCCF Permanent signed', table: 'cccf_forma_permanent', id: 'id', url: 'SignedFileUrl' },
        { module: 'hiyari', label: 'Hiyari attachment', table: 'hiyarireports', id: 'id', url: 'AttachmentUrl', where: 'DeletedAt IS NULL' },
        { module: 'hiyari', label: 'Hiyari signed', table: 'hiyarireports', id: 'id', url: 'SignedFileUrl', where: 'DeletedAt IS NULL' },
        { module: 'contractor', label: 'Contractor document', table: 'contractor_documents', id: 'id', url: 'FileUrl', where: 'DeletedAt IS NULL' },
        { module: 'contractor', label: 'Contractor accident', table: 'contractor_accidentfiles', id: 'id', url: 'FileUrl' },
        { module: 'accident', label: 'Accident attachment', table: 'accident_attachments', id: 'id', url: 'FileURL' },
        { module: 'forklift', label: 'Forklift document', table: 'forklift_license_documents', id: 'ID', url: 'FileUrl', where: 'DeletedAt IS NULL' },
        { module: 'forklift', label: 'Forklift employee photo', table: 'forklift_employee_photos', id: 'ID', url: 'PhotoUrl', where: 'DeletedAt IS NULL' },
        { module: 'forklift', label: 'Forklift card front', table: 'forklift_card_template_versions', id: 'ID', url: 'FrontImageUrl' },
        { module: 'forklift', label: 'Forklift card back', table: 'forklift_card_template_versions', id: 'ID', url: 'BackImageUrl' },
        { module: 'machine-safety', label: 'Machine Safety file', table: 'machine_safety_files', id: 'id', url: 'FileUrl' },
        { module: 'yokoten', label: 'Yokoten response', table: 'yokoten_response_files', id: 'FileID', url: 'FileURL' },
        { module: 'ojt', label: 'OJT / SCW document', table: 'scw_documents', id: 'id', url: 'FileURL' },
        { module: 'johnny', label: 'Johnny AI knowledge', table: 'johnny_kb_documents', id: 'id', url: 'FileUrl' },
    ];
    const references = [];
    const referencedNames = new Set();
    const sourceSummary = [];
    for (const source of sources) {
        try {
            const filter = source.where ? `(${source.where}) AND` : '';
            const sql = `SELECT \`${source.id}\` record_id, \`${source.url}\` file_url FROM \`${source.table}\` WHERE ${filter} \`${source.url}\` IS NOT NULL AND CHAR_LENGTH(TRIM(\`${source.url}\`)) > 0`;
            const [rows] = await db.query(sql);
            let missing = 0;
            for (const row of rows) {
                const fileUrl = String(row.file_url || '').trim();
                let pathname = '';
                try { pathname = new URL(fileUrl, 'http://local.invalid').pathname; } catch { pathname = ''; }
                const local = pathname.includes('/uploads/');
                const filename = local ? path.basename(decodeURIComponent(path.basename(pathname))) : '';
                const exists = local && filename ? uploadDirs.some(dir => fs.existsSync(path.join(dir, filename))) : false;
                if (filename) referencedNames.add(filename.toLowerCase());
                if (local && !exists) missing++;
                references.push({ module: source.module, source: source.label, recordId: String(row.record_id ?? ''), url: fileUrl, filename, local, exists: local ? exists : null });
            }
            sourceSummary.push({ module: source.module, label: source.label, available: true, references: rows.length, missing });
        } catch {
            sourceSummary.push({ module: source.module, label: source.label, available: false, references: 0, missing: 0 });
        }
    }
    const existingDirs = uploadDirs.filter(dir => fs.existsSync(dir));
    const directoryExists = existingDirs.length > 0;
    let directoryReadable = false;
    let directoryWritable = false;
    let diskFiles = [];
    const diskFileMap = new Map();
    for (const dir of existingDirs) {
        try {
            fs.accessSync(dir, fs.constants.R_OK);
            directoryReadable = true;
            fs.readdirSync(dir, { withFileTypes: true }).filter(item => item.isFile()).forEach(item => diskFileMap.set(item.name.toLowerCase(), item.name));
        } catch {}
        try { fs.accessSync(dir, fs.constants.W_OK); directoryWritable = true; } catch {}
    }
    diskFiles = [...diskFileMap.values()];
    const missingDetails = references.filter(item => item.local && item.exists === false);
    const orphanDetails = diskFiles.filter(name => !referencedNames.has(name.toLowerCase()));
    return {
        phase: 'storage_file_health', readOnly: true,
        config: { publicBaseUrlConfigured: Boolean(String(process.env.PUBLIC_UPLOAD_BASE_URL || '').trim()), directoryExists, directoryReadable, directoryWritable, storageRootsChecked: uploadDirs.length },
        status: !directoryExists || !directoryReadable ? 'critical' : missingDetails.length ? 'warning' : 'ok',
        referencesTotal: references.length,
        localReferences: references.filter(item => item.local).length,
        externalReferences: references.filter(item => !item.local).length,
        missingFiles: missingDetails.length,
        orphanFiles: orphanDetails.length,
        diskFiles: diskFiles.length,
        missingDetails: missingDetails.slice(0, 100),
        orphanDetails: orphanDetails.slice(0, 100),
        sources: sourceSummary,
    };
}

async function buildSystemSecurityHealth() {
    const roles = ['ADMIN', 'USER', 'VIEWER', 'EXECUTIVE', 'MANAGER', 'STAFF', 'SAFETY_OFFICER'];
    const permissions = ['VIEW_DASHBOARD', 'MANAGE_USERS', 'VIEW_REPORT', 'APPROVE_SAFETY', 'SUBMIT_SAFETY', 'FOURM_TRAINING_MANAGE', 'FORKLIFT_VIEW', 'FORKLIFT_REQUEST', 'FORKLIFT_APPROVE', 'FORKLIFT_MANAGE', 'FORKLIFT_RENEW', 'FORKLIFT_SUSPEND', 'FORKLIFT_PRINT', 'FORKLIFT_EXPORT', 'FORKLIFT_DOCUMENT_MANAGE', 'FORKLIFT_TEMPLATE_MANAGE', 'FORKLIFT_SETTINGS_MANAGE', 'FORKLIFT_AUDIT_VIEW'];
    const expectedEntries = roles.length * permissions.length;
    const count = async (sql, params = []) => {
        try { const [[row]] = await db.query(sql, params); return Number(row?.total || 0); }
        catch { return 0; }
    };
    const roleMarks = roles.map(() => '?').join(',');
    const permissionMarks = permissions.map(() => '?').join(',');
    const hasSafetyUnit = await columnExists('employees', 'SafetyUnit');
    const [
        matrixEntries, unknownMatrixEntries, userOverrides, orphanOverrides,
        employeeTotal, adminUsers, unknownRoles, missingDepartment, missingUnit,
        legacyPasswords, forcedPasswordChange, failedLogins24h, passwordChanges24h,
    ] = await Promise.all([
        count(`SELECT COUNT(*) total FROM Admin_RolePermissions WHERE UPPER(role) IN (${roleMarks}) AND permission IN (${permissionMarks})`, [...roles, ...permissions]),
        count(`SELECT COUNT(*) total FROM Admin_RolePermissions WHERE UPPER(role) NOT IN (${roleMarks}) OR permission NOT IN (${permissionMarks})`, [...roles, ...permissions]),
        count('SELECT COUNT(*) total FROM Admin_UserPermissions'),
        count('SELECT COUNT(*) total FROM Admin_UserPermissions p LEFT JOIN Employees e ON e.EmployeeID=p.employee_id WHERE e.EmployeeID IS NULL'),
        count('SELECT COUNT(*) total FROM Employees'),
        count("SELECT COUNT(*) total FROM Employees WHERE UPPER(TRIM(COALESCE(Role,'')))='ADMIN'"),
        count(`SELECT COUNT(*) total FROM Employees WHERE COALESCE(TRIM(Role),'')<>'' AND UPPER(TRIM(Role)) NOT IN (${roleMarks})`, roles),
        count("SELECT COUNT(*) total FROM Employees WHERE COALESCE(TRIM(Department),'')=''"),
        count(hasSafetyUnit
            ? "SELECT COUNT(*) total FROM Employees WHERE COALESCE(NULLIF(TRIM(SafetyUnit),''),NULLIF(TRIM(Unit),''),NULLIF(TRIM(Team),'')) IS NULL"
            : "SELECT COUNT(*) total FROM Employees WHERE COALESCE(NULLIF(TRIM(Unit),''),NULLIF(TRIM(Team),'')) IS NULL"),
        count("SELECT COUNT(*) total FROM Employees WHERE Password IS NULL OR TRIM(Password)=''"),
        count('SELECT COUNT(*) total FROM Employees WHERE MustChangePassword=1'),
        count("SELECT COUNT(*) total FROM Admin_AuditLogs WHERE Action='LOGIN_FAILED' AND ActionTime>=DATE_SUB(NOW(),INTERVAL 1 DAY)"),
        count("SELECT COUNT(*) total FROM Admin_AuditLogs WHERE Action='PASSWORD_CHANGED' AND ActionTime>=DATE_SUB(NOW(),INTERVAL 1 DAY)"),
    ]);
    const jwtConfigured = Boolean(String(process.env.JWT_SECRET || '').trim());
    const matrixMissing = Math.max(0, expectedEntries - matrixEntries);
    const findings = [
        { key: 'jwt_config', label: 'JWT signing configuration', count: jwtConfigured ? 0 : 1, severity: jwtConfigured ? 'ok' : 'critical' },
        { key: 'matrix_incomplete', label: 'Permission matrix entries not explicit', count: matrixMissing, severity: matrixMissing ? 'low' : 'ok' },
        { key: 'unknown_roles', label: 'Employees with unknown roles', count: unknownRoles, severity: unknownRoles ? 'medium' : 'ok' },
        { key: 'orphan_overrides', label: 'Permission overrides without employee', count: orphanOverrides, severity: orphanOverrides ? 'medium' : 'ok' },
        { key: 'missing_department', label: 'Employees missing department', count: missingDepartment, severity: missingDepartment ? 'medium' : 'ok' },
        { key: 'missing_unit', label: 'Employees missing Unit/Safety Unit', count: missingUnit, severity: missingUnit ? 'low' : 'ok' },
        { key: 'legacy_passwords', label: 'Accounts still using legacy first-login password', count: legacyPasswords, severity: legacyPasswords ? 'high' : 'ok' },
        { key: 'failed_logins_24h', label: 'Failed login attempts in 24h', count: failedLogins24h, severity: failedLogins24h >= 20 ? 'high' : failedLogins24h ? 'low' : 'ok' },
    ];
    const high = findings.filter(item => ['critical', 'high'].includes(item.severity) && item.count).length;
    const medium = findings.filter(item => item.severity === 'medium' && item.count).length;
    return {
        phase: 'permission_security_health', readOnly: true, status: high ? 'critical' : medium ? 'warning' : 'ok', findings,
        permissionMatrix: { roles: roles.length, permissions: permissions.length, expectedEntries, explicitEntries: matrixEntries, missingEntries: matrixMissing, unknownEntries: unknownMatrixEntries, userOverrides, orphanOverrides },
        routeGuards: { adminApiMountProtected: true, phpAdminHandlerProtected: true, adminHealthRequiresAdmin: true },
        users: { total: employeeTotal, admins: adminUsers, unknownRoles, missingDepartment, missingUnit },
        auth: { jwtConfigured, jwtTtl: String(process.env.JWT_EXPIRES_IN || '24h'), passwordMinLength: 4, legacyPasswords, mustChangePassword: forcedPasswordChange, failedLogins24h, passwordChanges24h },
    };
}

function buildSystemVersionHealth() {
    const projectRoot = path.resolve(__dirname, '..', '..');
    const cacheBust = '20260702-system-health-ky-safetycore-hotfix-v2';
    const manifestPath = path.join(projectRoot, 'deploy-manifest.json');
    let manifest = {};
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch {}
    const runtimeFiles = [
        { key: 'index', path: 'index.html' },
        { key: 'main', path: 'public/js/main.js' },
        { key: 'admin_ui', path: 'public/js/pages/admin.js' },
        { key: 'php_health', path: 'api/handlers/admin_phase8.php' },
        { key: 'node_health', path: 'backend/routes/admin.js' },
    ];
    const files = runtimeFiles.map(item => {
        const absolute = path.join(projectRoot, ...item.path.split('/'));
        try {
            const stat = fs.statSync(absolute);
            const hash = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex').slice(0, 16);
            return { ...item, exists: stat.isFile(), size: stat.size, modifiedAt: stat.mtime.toISOString(), sha256: hash };
        } catch { return { ...item, exists: false, size: 0, modifiedAt: null, sha256: null }; }
    });
    let nodeText = '';
    let phpText = '';
    try { nodeText = fs.readFileSync(__filename, 'utf8'); } catch {}
    try { phpText = fs.readFileSync(path.join(projectRoot, 'api', 'handlers', 'admin_phase8.php'), 'utf8'); } catch {}
    const markers = [
        { key: 'module_registry', php: phpText.includes('admin8_health_registry'), node: nodeText.includes('SYSTEM_HEALTH_MODULES') },
        { key: 'workflow_rules', php: phpText.includes('admin8_health_workflow_rules'), node: nodeText.includes('buildSystemHealthWorkflowRules') },
        { key: 'storage_health', php: phpText.includes('admin8_storage_health'), node: nodeText.includes('buildSystemStorageHealth') },
        { key: 'security_health', php: phpText.includes('admin8_security_health'), node: nodeText.includes('buildSystemSecurityHealth') },
        { key: 'version_health', php: phpText.includes('admin8_version_health'), node: nodeText.includes('buildSystemVersionHealth') },
        { key: 'snapshot_health', php: phpText.includes('admin8_health_snapshot_history'), node: nodeText.includes('getSystemHealthSnapshotHistory') },
    ].map(marker => ({ ...marker, parity: marker.php && marker.node }));
    const filesMissing = files.filter(file => !file.exists).length;
    const parityMissing = markers.filter(marker => !marker.parity).length;
    const manifestCacheMatch = String(manifest.cacheBust || '') === cacheBust;
    const smokePassed = String(manifest.lastSmoke?.status || '') === 'passed';
    const status = filesMissing || parityMissing || !manifestCacheMatch ? 'critical' : smokePassed ? 'ok' : 'warning';
    return {
        phase: 'deploy_version_health', readOnly: true, status, cacheBust,
        manifest: { available: Object.keys(manifest).length > 0, buildId: manifest.buildId || null, cacheBust: manifest.cacheBust || null, deployedAt: manifest.deployedAt || null, runtime: manifest.runtime || null, cacheMatch: manifestCacheMatch },
        lastSmoke: manifest.lastSmoke || { status: 'unknown', checkedAt: null, summary: 'No deploy smoke manifest available' },
        runtime: { active: 'node', nodeVersion: process.version, phpExpected: true },
        files, filesMissing, parityMarkers: markers, parityMissing,
    };
}

async function ensureSystemHealthSnapshotsTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS System_Health_Snapshots (
            id INT AUTO_INCREMENT PRIMARY KEY,
            SnapshotAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            Source VARCHAR(40) NOT NULL DEFAULT 'manual',
            BuildId VARCHAR(120),
            CacheBust VARCHAR(160),
            ReadinessScore INT NOT NULL DEFAULT 0,
            ReadinessStatus VARCHAR(40),
            CriticalModules INT NOT NULL DEFAULT 0,
            WarningModules INT NOT NULL DEFAULT 0,
            OkModules INT NOT NULL DEFAULT 0,
            FailedApi24h INT NOT NULL DEFAULT 0,
            StorageStatus VARCHAR(40),
            SecurityStatus VARCHAR(40),
            VersionStatus VARCHAR(40),
            PayloadJson LONGTEXT,
            CreatedBy VARCHAR(80),
            INDEX idx_snapshot_at (SnapshotAt),
            INDEX idx_status (ReadinessStatus),
            INDEX idx_build (BuildId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
}

function summarizeSystemHealthSnapshot(health = {}) {
    const readiness = health.readiness || {};
    const coverage = health.coverage || {};
    const apiHealth = health.apiHealth || {};
    const version = health.versionHealth || {};
    const manifest = version.manifest || {};
    return {
        buildId: manifest.buildId || '',
        cacheBust: manifest.cacheBust || version.cacheBust || '',
        readinessScore: Number(readiness.score || 0),
        readinessStatus: String(readiness.status || 'Unknown'),
        criticalModules: Number(coverage.modulesCritical || 0),
        warningModules: Number(coverage.modulesWarning || 0),
        okModules: Number(coverage.modulesOk || 0),
        failedApi24h: Number(apiHealth.failed24h || coverage.failedApiByModule24h || 0),
        storageStatus: String(health.storageHealth?.status || 'unknown'),
        securityStatus: String(health.securityHealth?.status || 'unknown'),
        versionStatus: String(version.status || 'unknown'),
    };
}

async function getSystemHealthSnapshotHistory(limit = 48) {
    try {
        const max = Math.max(1, Math.min(240, Number(limit) || 48));
        const [rows] = await db.query(`
            SELECT id, SnapshotAt, Source, BuildId, CacheBust, ReadinessScore, ReadinessStatus,
                   CriticalModules, WarningModules, OkModules, FailedApi24h,
                   StorageStatus, SecurityStatus, VersionStatus, CreatedBy
            FROM System_Health_Snapshots
            ORDER BY SnapshotAt DESC
            LIMIT ?
        `, [max]);
        const latest = rows[0] || null;
        const previous = rows[1] || null;
        return {
            phase: 'automation_scheduled_snapshot',
            readOnly: true,
            latest,
            previous,
            trend: {
                scoreDelta: latest && previous ? Number(latest.ReadinessScore || 0) - Number(previous.ReadinessScore || 0) : 0,
                criticalDelta: latest && previous ? Number(latest.CriticalModules || 0) - Number(previous.CriticalModules || 0) : 0,
                failedApiDelta: latest && previous ? Number(latest.FailedApi24h || 0) - Number(previous.FailedApi24h || 0) : 0,
            },
            rows,
        };
    } catch (err) {
        return { phase: 'automation_scheduled_snapshot', readOnly: true, error: err.message, rows: [] };
    }
}

async function insertSystemHealthSnapshot(health = {}, user = {}, source = 'manual') {
    await ensureSystemHealthSnapshotsTable();
    const summary = summarizeSystemHealthSnapshot(health);
    const payload = JSON.stringify({
        coverage: health.coverage || {},
        readiness: health.readiness || {},
        apiHealth: health.apiHealth || {},
        workflowHealth: health.workflowHealth || {},
        storageHealth: health.storageHealth || {},
        securityHealth: health.securityHealth || {},
        versionHealth: health.versionHealth || {},
    });
    const [result] = await db.query(`
        INSERT INTO System_Health_Snapshots
        (Source, BuildId, CacheBust, ReadinessScore, ReadinessStatus, CriticalModules, WarningModules, OkModules,
         FailedApi24h, StorageStatus, SecurityStatus, VersionStatus, PayloadJson, CreatedBy)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
        String(source || 'manual').slice(0, 40),
        summary.buildId,
        summary.cacheBust,
        summary.readinessScore,
        summary.readinessStatus,
        summary.criticalModules,
        summary.warningModules,
        summary.okModules,
        summary.failedApi24h,
        summary.storageStatus,
        summary.securityStatus,
        summary.versionStatus,
        payload,
        user?.EmployeeID || user?.id || user?.employeeId || user?.EmployeeName || 'admin',
    ]);
    return { id: result.insertId, ...summary };
}

async function tableCount(tableName) {
    try {
        const safe = String(tableName).replace(/`/g, '``');
        const [[row]] = await db.query(`SELECT COUNT(*) AS total FROM \`${safe}\``);
        return Number(row?.total ?? 0);
    } catch {
        return null;
    }
}

async function columnExists(tableName, columnName) {
    try {
        const [[row]] = await db.query(
            `SELECT COUNT(*) AS total
               FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND LOWER(TABLE_NAME) = LOWER(?)
                AND LOWER(COLUMN_NAME) = LOWER(?)`,
            [tableName, columnName]
        );
        return Number(row?.total || 0) > 0;
    } catch {
        return false;
    }
}

async function buildSystemHealthModuleMap() {
    const auditFailedRows = await db.query(
        `SELECT COALESCE(Module, '') AS Module, COALESCE(Path, '') AS Path, COUNT(*) AS total
           FROM Admin_AuditLogs
          WHERE ActionTime >= DATE_SUB(NOW(), INTERVAL 1 DAY)
            AND (StatusCode >= 400 OR Action LIKE 'FAILED%')
          GROUP BY COALESCE(Module, ''), COALESCE(Path, '')`
    ).then(([rows]) => rows).catch(() => []);
    const failedByKey = new Map();
    const failedPathsByKey = new Map();
    for (const row of auditFailedRows) {
        const moduleKey = String(row.Module || '').trim() || systemHealthModuleFromPath(row.Path);
        const normalized = moduleKey.replace(/_/g, '-').toLowerCase();
        const total = Number(row.total || 0);
        failedByKey.set(normalized, (failedByKey.get(normalized) || 0) + total);
        const paths = failedPathsByKey.get(normalized) || [];
        paths.push({ path: row.Path || '-', count: total });
        failedPathsByKey.set(normalized, paths);
    }

    const modules = [];
    for (const mod of SYSTEM_HEALTH_MODULES) {
        const tableStatuses = [];
        for (const table of mod.tables || []) {
            const count = await tableCount(table);
            const requirement = systemHealthTableRequirement(mod.key, table);
            const requiredColumns = mod.columns?.[table] || [];
            const columns = [];
            for (const col of requiredColumns) {
                columns.push({ name: col, ok: count !== null ? await columnExists(table, col) : false });
            }
            tableStatuses.push({
                name: table,
                requirement,
                count,
                exists: count !== null,
                columns,
                missingColumns: columns.filter(col => !col.ok).map(col => col.name),
            });
        }
        const missingTables = tableStatuses.filter(table => !table.exists).map(table => table.name);
        const missingRequiredTables = tableStatuses.filter(table => !table.exists && table.requirement === 'required').map(table => table.name);
        const missingOptionalTables = tableStatuses.filter(table => !table.exists && table.requirement === 'optional').map(table => table.name);
        const missingBacklogTables = tableStatuses.filter(table => !table.exists && table.requirement === 'backlog').map(table => table.name);
        const missingColumns = tableStatuses.flatMap(table => table.missingColumns.map(col => `${table.name}.${col}`));
        const api = (mod.api || []).map(path => ({ path, method: 'GET', configured: true }));
        const failed24h = (failedByKey.get(mod.key) || failedByKey.get(mod.key.replace(/-/g, '_')) || 0);
        const failedPaths = failedPathsByKey.get(mod.key) || failedPathsByKey.get(mod.key.replace(/-/g, '_')) || [];
        const status = missingRequiredTables.length ? 'critical' : (missingOptionalTables.length || missingColumns.length || failed24h ? 'warning' : 'ok');
        const rootCauses = [
            ...missingRequiredTables.map(table => ({
                type: 'missing_table',
                severity: 'high',
                label: `Required table missing or unreadable: ${table}`,
                detail: 'This table is required by the active runtime and should exist in production.',
            })),
            ...missingOptionalTables.map(table => ({
                type: 'missing_optional_table',
                severity: 'low',
                label: `Optional table not available: ${table}`,
                detail: 'This supports an optional feature and does not block module readiness.',
            })),
            ...missingBacklogTables.map(table => ({
                type: 'backlog_table',
                severity: 'info',
                label: `Backlog table not available: ${table}`,
                detail: 'This table is tracked for future scope and does not reduce readiness score.',
            })),
            ...missingColumns.map(column => ({
                type: 'missing_column',
                severity: 'high',
                label: `Missing expected column: ${column}`,
                detail: 'The module table exists, but the expected schema column was not found.',
            })),
            ...failedPaths.map(item => ({
                type: 'failed_api',
                severity: 'medium',
                label: `Failed API action: ${item.path}`,
                detail: `${item.count} failed action(s) in the last 24 hours.`,
            })),
        ];
        const recommendedActions = [];
        if (missingRequiredTables.length) recommendedActions.push('ตรวจ migration/table name ของ required table ใน production และยืนยันว่า database user อ่านตารางได้');
        if (missingOptionalTables.length) recommendedActions.push('ทบทวนว่า optional feature นี้เปิดใช้งานจริงหรือไม่ ก่อนตัดสินใจ deploy table เพิ่ม');
        if (missingBacklogTables.length) recommendedActions.push('เก็บ backlog table ไว้ใน roadmap โดยไม่ต้องแก้ production readiness รอบนี้');
        if (missingColumns.length) recommendedActions.push('Apply additive schema migration ล่าสุดของ module นี้ หรือ sync column ให้ตรงกับ runtime');
        if (failed24h) recommendedActions.push('เปิด Audit Log ด้วย failed preset แล้วดู request ล่าสุดของ module นี้');
        if (!recommendedActions.length) recommendedActions.push('ยังไม่พบ root cause สำคัญจาก Phase 4');
        modules.push({
            key: mod.key,
            label: mod.label,
            group: mod.group,
            nav: mod.nav,
            status,
            tableCount: tableStatuses.length,
            existingTables: tableStatuses.filter(table => table.exists).length,
            missingTables,
            missingRequiredTables,
            missingOptionalTables,
            missingBacklogTables,
            missingColumns,
            totalRows: tableStatuses.reduce((sum, table) => sum + (Number(table.count) || 0), 0),
            apiCount: api.length,
            failedApi24h: failed24h,
            failedPaths,
            rootCauses,
            recommendedActions,
            tables: tableStatuses,
            api,
        });
    }
    return modules;
}

function clampSafetyCoreYear(value) {
    const year = Number(value) || new Date().getFullYear();
    return Math.min(2100, Math.max(2000, year));
}

function clampSafetyCoreMonth(value) {
    const month = Number(value) || (new Date().getMonth() + 1);
    return Math.min(12, Math.max(1, month));
}

function safetyCoreMonthLabel(month) {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1] || '';
}

function countMap(rows, key = 'EmployeeID', count = 'count') {
    const map = new Map();
    (rows || []).forEach(row => {
        const id = String(row[key] || '').trim();
        if (!id) return;
        map.set(id, Number(row[count] || 0));
    });
    return map;
}

function safetyCoreRecord(actual, target, unitText = 'เรื่อง/ปี') {
    const a = Number(actual || 0);
    const t = Number(target || 0);
    return t > 0 ? `${a}/${t} (${unitText})` : 'N/A';
}

function safetyCorePatrolRecord(actual, requiredToDate, yearlyTarget) {
    const target = Number(yearlyTarget || 0);
    if (target <= 0) return 'N/A';
    return `${Number(actual || 0)}/${Number(requiredToDate || 0)} (${target}) ครั้ง`;
}

async function getSafetyCorePatrolRecordMap(employees = [], year) {
    const ids = [...new Set((employees || [])
        .map(emp => String(emp.EmployeeID || '').trim())
        .filter(Boolean))];
    if (!ids.length) return new Map();

    const [rosterRows] = await db.query(
        `SELECT EmployeeID,RosterGroup,TargetPerYear
         FROM Patrol_Roster
         WHERE EmployeeID IN (${ids.map(() => '?').join(',')})
         ORDER BY CASE WHEN RosterGroup='top_management' THEN 0 ELSE 1 END`,
        ids
    ).catch(() => [[]]);
    const rosterByEmployee = new Map();
    (rosterRows || []).forEach(row => {
        const id = String(row.EmployeeID || '').trim();
        if (id && !rosterByEmployee.has(id)) rosterByEmployee.set(id, row);
    });

    const out = new Map();
    for (const [employeeId, roster] of rosterByEmployee.entries()) {
        try {
            const group = String(roster.RosterGroup || '');
            const detail = group === 'top_management'
                ? await patrolRoutes.buildTopManagementAttendanceDetail?.(employeeId, year)
                : await patrolRoutes.buildSupervisorAttendanceDetail?.(employeeId, year, { allowPositionSupervisor: true });
            if (!detail) continue;
            const summary = detail.summary || {};
            const rosterDetail = detail.roster || {};
            const requiredToDate = Number(summary.requiredToDate || 0);
            const accepted = Number(
                summary.acceptedCoverageToDate
                ?? summary.checkedToDate
                ?? summary.completedScheduled
                ?? summary.completedToDateCapped
                ?? 0
            );
            out.set(employeeId, {
                accepted,
                requiredToDate,
                yearlyTarget: Number(rosterDetail.TargetPerYear || summary.yearlyTarget || roster.TargetPerYear || 0),
            });
        } catch {
            // Preserve the Safety Core Data table even when a Patrol detail row cannot be resolved.
        }
    }
    return out;
}

const SAFETY_CORE_ACTIVITY_COLUMNS = [
    ['SafetyPatrolRecord', 'patrol'],
    ['HiyariHatto', 'hiyari'],
    ['KYAbility', 'ky'],
    ['CCCFPermanent', 'cccf_permanent'],
    ['CCCFFormA', 'cccf_worker'],
    ['PatrolSystem', 'patrol_issue'],
];
const SAFETY_CORE_ACTIVITY_MAP = new Map((ACTIVITIES || []).map(activity => [activity.key, activity]));

function safetyCoreTargetRecord(actual, targetRow, activityKey) {
    const activity = SAFETY_CORE_ACTIVITY_MAP.get(activityKey) || {};
    if (!targetRow || Number(targetRow.IsNA || 0) === 1) return 'N/A';
    const target = Number(targetRow.YearlyTarget || 0);
    if (target <= 0) return 'N/A';
    const unitLabel = activityKey === 'ky' ? 'เดือน' : (activity.unitLabel || 'target');
    return `${Number(actual || 0)}/${target} (${unitLabel})`;
}

function safetyCoreRatioRecord(ratio, targetRow) {
    if (!targetRow || Number(targetRow.IsNA || 0) === 1) return 'N/A';
    if (!ratio || ratio.noData || Number(ratio.denominator || 0) <= 0) return 'N/A';
    const pct = Number.isFinite(Number(ratio.completionPct))
        ? Number(ratio.completionPct)
        : Math.round(Number(ratio.numerator || 0) * 100 / Number(ratio.denominator || 1));
    return `${Math.max(0, Math.min(100, pct))}%`;
}

function safetyCoreDepartmentRatioRecord(ratio, departmentTargetRow = null) {
    if (departmentTargetRow && Number(departmentTargetRow.IsNA || 0) === 1) return 'N/A';
    if (!ratio || Number(ratio.denominator || 0) <= 0) return 'No Issue';
    const pct = Number.isFinite(Number(ratio.completionPct))
        ? Number(ratio.completionPct)
        : Math.round(Number(ratio.numerator || 0) * 100 / Number(ratio.denominator || 1));
    return `${Math.max(0, Math.min(100, pct))}%`;
}

function safetyCoreEffectiveTargetMaps(merged) {
    return {
        effectiveTarget: key => merged.overrideMap[key] || merged.scopeMap[key] || merged.templateMap[key] || null,
        positionTemplate: key => merged.templateMap[key] || null,
        employeeId: merged.employeeId || '',
        department: merged.department || '',
        unit: merged.unit || '',
    };
}

function safetyCoreCccfWorkerRecord(progressEmployee, targetRow) {
    if (!targetRow || Number(targetRow.IsNA || 0) === 1) return 'N/A';
    const target = Number(targetRow.YearlyTarget || 0);
    if (target <= 0) return 'N/A';
    return `${Number(progressEmployee.actualTowardTarget || 0)}/${target} (คน)`;
}

function safetyCoreLinkedCccfWorkerRecord(progressEmployee, targetRow) {
    if (!targetRow || Number(targetRow.IsNA || 0) === 1) return 'N/A';
    const target = Number(targetRow.YearlyTarget || 0);
    if (target <= 0) return 'N/A';
    const actual = Number(progressEmployee?.rawRecords ?? progressEmployee?.actualTowardTarget ?? 0);
    return `${Math.min(Math.max(0, actual), target)}/${target} (${SAFETY_CORE_ACTIVITY_MAP.get('cccf_worker')?.unitLabel || 'target'})`;
}

async function getSafetyCoreDashboardConfig() {
    const defaults = { cccfWorkerSource: 'manual_unit_target', cccfWorkerSourceByYear: {} };
    try {
        const [[row]] = await db.query(
            "SELECT ConfigValue FROM Dashboard_Config WHERE ConfigKey='enterprise' LIMIT 1"
        );
        const raw = row?.ConfigValue;
        const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
        return { ...defaults, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    } catch {
        return defaults;
    }
}

function resolveSafetyCoreCccfWorkerSource(config = {}, year = new Date().getFullYear()) {
    const annual = config.cccfWorkerSourceByYear;
    const annualSource = annual && typeof annual === 'object' && !Array.isArray(annual)
        ? annual[String(parseInt(year, 10))]
        : null;
    const source = annualSource || config.cccfWorkerSource;
    return source === 'actual_department_worker'
        ? 'actual_department_worker'
        : 'manual_unit_target';
}

function normalizeSafetyCoreCccfUnit(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

async function getSafetyCoreCccfWorkerUnitMap(year, source = null) {
    const resolvedSource = source || resolveSafetyCoreCccfWorkerSource(await getSafetyCoreDashboardConfig(), year);
    try {
        const [[rows], [settingRows]] = await Promise.all([
            db.query(
            `SELECT TRIM(t.unit_name) AS UnitName,
                    t.yearly_target,
                    t.achieved_override,
                    COALESCE(w.computed_achieved, 0) AS computed_achieved
               FROM CCCF_Unit_Targets t
               LEFT JOIN (
                   SELECT TRIM(SafetyUnit) AS UnitName,
                          COUNT(DISTINCT COALESCE(
                              NULLIF(TRIM(EmployeeID), ''),
                              NULLIF(LOWER(TRIM(EmployeeName)), ''),
                              CONCAT('__legacy_row__', id)
                          )) AS computed_achieved
                     FROM CCCF_FormA_Worker
                    WHERE YEAR(SubmitDate) = ?
                    GROUP BY TRIM(SafetyUnit)
               ) w ON TRIM(w.UnitName) = TRIM(t.unit_name)
              WHERE t.target_year = ?`,
            [year, year]
            ),
            db.query("SELECT value FROM App_Settings WHERE key_name='cccf_unit_sel' LIMIT 1").catch(() => [[]]),
        ]);
        let selectedUnits = [];
        try {
            const parsed = JSON.parse(settingRows?.[0]?.value || '[]');
            selectedUnits = Array.isArray(parsed) ? parsed : [];
        } catch { selectedUnits = []; }
        const selectedUnitKeys = new Set(selectedUnits.map(normalizeSafetyCoreCccfUnit).filter(Boolean));
        const map = new Map();
        (rows || []).forEach(row => {
            const unit = String(row.UnitName || '').trim();
            const unitKey = normalizeSafetyCoreCccfUnit(unit);
            const target = Math.max(0, Number(row.yearly_target || 0));
            if (!unitKey || target <= 0 || (selectedUnitKeys.size && !selectedUnitKeys.has(unitKey))) return;
            const computed = Math.max(0, Number(row.computed_achieved || 0));
            const hasOverride = row.achieved_override !== null && row.achieved_override !== undefined && String(row.achieved_override) !== '';
            const achieved = resolvedSource === 'actual_department_worker'
                ? computed
                : (hasOverride ? Math.max(0, Number(row.achieved_override || 0)) : computed);
            map.set(unitKey, { target, achieved, computed, source: resolvedSource });
        });
        return map;
    } catch {
        return new Map();
    }
}

function safetyCoreCccfWorkerUnitRecord(unit, unitMap) {
    const key = normalizeSafetyCoreCccfUnit(unit);
    const row = key ? unitMap.get(key) : null;
    if (!row) return 'N/A';
    const target = Number(row.target || 0);
    if (target <= 0) return 'N/A';
    return `${Math.max(0, Number(row.achieved || 0))}/${target} (${SAFETY_CORE_ACTIVITY_MAP.get('cccf_worker')?.unitLabel || 'target'})`;
}

async function getSafetyCoreDepartmentScopeTargetMap(activityKey, year) {
    const safeYear = Math.max(2000, Math.min(2100, Number(year) || new Date().getFullYear()));
    const map = new Map();
    try {
        const [legacyRows] = await db.query(
            `SELECT Department, Unit, ActivityKey, YearlyTarget, PassPct, IsNA
               FROM Activity_Scope_Overrides
              WHERE ActivityKey = ? AND TRIM(COALESCE(Unit, '')) = ''`,
            [activityKey]
        );
        (legacyRows || []).forEach(row => {
            const dept = String(row.Department || '').trim();
            if (dept) map.set(dept, { ...row, source: 'scope', targetYear: null });
        });
        const [yearRows] = await db.query(
            `SELECT Department, Unit, ActivityKey, YearlyTarget, PassPct, IsNA, TargetYear
               FROM Activity_Scope_Override_Years
              WHERE ActivityKey = ? AND TRIM(COALESCE(Unit, '')) = '' AND TargetYear IN (?, 0)
              ORDER BY CASE WHEN TargetYear = ? THEN 0 ELSE 1 END`,
            [activityKey, safeYear, safeYear]
        );
        (yearRows || []).forEach(row => {
            const dept = String(row.Department || '').trim();
            if (dept && (!map.has(dept) || Number(row.TargetYear || 0) === safeYear)) {
                map.set(dept, { ...row, source: 'scope', targetYear: Number(row.TargetYear || 0) });
            }
        });
    } catch {
        return map;
    }
    return map;
}

function parseSafetyCoreRosterEmployeeIds(body = {}) {
    const values = [];
    if (Array.isArray(body.EmployeeIDs)) values.push(...body.EmployeeIDs);
    if (body.EmployeeID !== undefined) values.push(body.EmployeeID);
    return [...new Set(values
        .flatMap(value => String(value || '').split(/[\s,;]+/))
        .map(value => value.trim())
        .filter(Boolean))];
}

async function ensureSafetyCoreExportRosterTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS Safety_Core_Export_Roster (
            id INT AUTO_INCREMENT PRIMARY KEY,
            EmployeeID VARCHAR(50) NOT NULL,
            SortOrder INT NOT NULL DEFAULT 999,
            IsActive TINYINT(1) NOT NULL DEFAULT 1,
            CreatedBy VARCHAR(50) DEFAULT NULL,
            CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedBy VARCHAR(50) DEFAULT NULL,
            UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_employee (EmployeeID),
            KEY idx_sort (SortOrder),
            KEY idx_employee (EmployeeID),
            KEY idx_active (IsActive)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
}

async function getSafetyCoreExportRoster() {
    try {
        const [rows] = await db.query(`
            SELECT
                r.id AS RosterID,
                r.EmployeeID,
                r.SortOrder,
                e.EmployeeName,
                e.Department,
                e.Unit,
                e.Position
            FROM Safety_Core_Export_Roster r
            INNER JOIN Employees e ON e.EmployeeID = r.EmployeeID
            WHERE r.IsActive = 1
            ORDER BY r.SortOrder ASC, e.EmployeeName ASC
        `);
        return rows || [];
    } catch {
        return [];
    }
}

async function getSafetyCoreData({ year, month }) {
    const safeRows = async (sql, params = []) => {
        try {
            const [rows] = await db.query(sql, params);
            return rows || [];
        } catch {
            return [];
        }
    };
    const safeScalar = async (sql, params = [], fallback = 0) => {
        try {
            const [[row]] = await db.query(sql, params);
            return Number(row?.total ?? row?.count ?? row?.cnt ?? fallback) || 0;
        } catch {
            return fallback;
        }
    };

    const employees = await getSafetyCoreExportRoster();

    const [
        patrolRows,
        hiyariRows,
        kyRows,
        cccfWorkerProgress,
        cccfPermanentRows,
    ] = await Promise.all([
        safeRows(`
            SELECT EmployeeID, SUM(count) AS count
            FROM (
                SELECT UserID AS EmployeeID, COUNT(*) AS count
                FROM Patrol_Attendance
                WHERE YEAR(PatrolDate) = ?
                GROUP BY UserID
                UNION ALL
                SELECT EmployeeID, COUNT(*) AS count
                FROM Patrol_Self_Checkin
                WHERE Year = ?
                GROUP BY EmployeeID
            ) x
            GROUP BY EmployeeID
        `, [year, year]),
        safeRows(`
            SELECT ReporterID AS EmployeeID, COUNT(*) AS count
            FROM HiyariReports
            WHERE DeletedAt IS NULL AND YEAR(ReportDate) = ?
            GROUP BY ReporterID
        `, [year]),
        safeRows(`
            SELECT id, ActivityDate, ReporterID, ReporterName, SubmittedByID, SubmittedByName, Department, SafetyUnit, Participants
            FROM KY_Activities
            WHERE YEAR(ActivityDate) = ?
        `, [year]),
        getCccfWorkerProgress(db, year).catch(() => ({ employees: [] })),
        safeRows(`
            SELECT AssigneeID AS EmployeeID, COUNT(*) AS count
            FROM CCCF_FormA_Permanent
            WHERE AssigneeID IS NOT NULL AND AssigneeID <> '' AND YEAR(SubmitDate) = ?
            GROUP BY AssigneeID
        `, [year]),
    ]);

    const patrolMap = countMap(patrolRows);
    const patrolRecordMap = await getSafetyCorePatrolRecordMap(employees, year);
    const hiyariMap = countMap(hiyariRows);
    const kyMap = buildKySafetyCoreCountMap(kyRows, employees);
    const cccfWorkerProgressMap = new Map((cccfWorkerProgress.employees || [])
        .map(row => [String(row.employeeId || '').trim(), row]));
    const cccfWorkerSource = resolveSafetyCoreCccfWorkerSource(await getSafetyCoreDashboardConfig(), year);
    const cccfWorkerUnitMap = await getSafetyCoreCccfWorkerUnitMap(year, cccfWorkerSource);
    const cccfPermanentMap = countMap(cccfPermanentRows);
    const patrolIssueDepartmentTargets = await getSafetyCoreDepartmentScopeTargetMap('patrol_issue', year);

    const rows = [];
    for (const emp of employees) {
        const employeeId = String(emp.EmployeeID || '').trim();
        const merged = await getMergedTargets(employeeId, year);
        const targetContext = safetyCoreEffectiveTargetMaps(merged);
        const { effectiveTarget, department } = targetContext;
        const hiyariCount = hiyariMap.get(employeeId) || 0;
        const kyCount = kyMap.get(employeeId) || 0;
        const cccfPermanentCount = cccfPermanentMap.get(employeeId) || 0;
        const cccfWorkerProgressRow = cccfWorkerProgressMap.get(employeeId);
        const cccfWorkerUnit = String(cccfWorkerProgressRow?.unit || emp.Unit || '').trim();
        const patrolIssueDepartment = String(department || emp.Department || '').trim();
        const patrolIssueRatio = await getDynamicActivityRatio('patrol_issue', patrolIssueDepartment, year);
        const patrolIssueTarget = patrolIssueDepartmentTargets.get(patrolIssueDepartment) || null;

        const row = {
            RosterID: emp.RosterID,
            SortOrder: Number(emp.SortOrder || 999),
            EmployeeID: employeeId,
            EmployeeName: emp.EmployeeName || employeeId,
            Department: emp.Department || 'N/A',
            Position: emp.Position || 'N/A',
            SafetyPatrolRecord: (() => {
                const targetRow = effectiveTarget('patrol');
                const metric = patrolRecordMap.get(employeeId);
                if (metric) {
                    const yearlyTarget = Number(targetRow?.YearlyTarget || metric.yearlyTarget || 0);
                    return safetyCorePatrolRecord(metric.accepted, metric.requiredToDate, yearlyTarget);
                }
                return safetyCoreTargetRecord(patrolMap.get(employeeId) || 0, targetRow, 'patrol');
            })(),
            HiyariHatto: safetyCoreTargetRecord(hiyariCount, effectiveTarget('hiyari'), 'hiyari'),
            KYAbility: safetyCoreTargetRecord(kyCount, effectiveTarget('ky'), 'ky'),
            CCCFPermanent: safetyCoreTargetRecord(cccfPermanentCount, effectiveTarget('cccf_permanent'), 'cccf_permanent'),
            CCCFFormA: safetyCoreCccfWorkerUnitRecord(cccfWorkerUnit, cccfWorkerUnitMap),
            PatrolSystem: safetyCoreDepartmentRatioRecord(patrolIssueRatio, patrolIssueTarget),
            Status: safetyCoreMonthLabel(month),
        };
        rows.push(row);
    }

    return {
        year,
        month,
        statusLabel: safetyCoreMonthLabel(month),
        cccfWorkerSource,
        summary: {
            employees: rows.length,
            patrolScoped: rows.filter(row => row.SafetyPatrolRecord !== 'N/A').length,
            hiyariScoped: rows.filter(row => row.HiyariHatto !== 'N/A').length,
            cccfPermanentScoped: rows.filter(row => row.CCCFPermanent !== 'N/A').length,
        },
        rows,
    };
}

// ─── Audit Log Helper ─────────────────────────────────────────────────────────
async function auditLog(req, action, targetType, targetId, detail) {
    try {
        await ensureAuditTable();
        await db.query(
            `INSERT INTO Admin_AuditLogs
             (AdminID, AdminName, Role, Department, Module, Action, Method, Path, StatusCode,
              TargetType, TargetID, Detail, Metadata, IPAddress, UserAgent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user?.id   || 'system',
                req.user?.name || 'System',
                req.user?.role || req.user?.Role || null,
                req.user?.department || req.user?.Department || null,
                'admin',
                action,
                req.method || null,
                String(req.originalUrl || req.path || '').slice(0, 255),
                200,
                targetType,
                String(targetId || ''),
                detail || null,
                JSON.stringify({ params: req.params || {}, query: req.query || {} }),
                req.ip || null,
                String(req.headers?.['user-agent'] || '').slice(0, 255) || null,
            ]
        );
        req.auditLogged = true;
    } catch (_) {
        // ถ้า log ไม่ได้ (table ยังไม่มี) ก็ข้ามไปได้ — ไม่ควร block main flow
    }
}

// =============================================================================
// EMPLOYEES
// =============================================================================

async function ensureRegistrationRequestsTable() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS registration_requests (
            ID BIGINT AUTO_INCREMENT PRIMARY KEY,
            ReferenceCode VARCHAR(36) NOT NULL,
            EmployeeID VARCHAR(50) NOT NULL,
            EmployeeName VARCHAR(150),
            Department VARCHAR(150),
            Unit VARCHAR(150),
            Position VARCHAR(150),
            CompanyEmail VARCHAR(150),
            PasswordHash VARCHAR(255) NULL,
            Status VARCHAR(20) NOT NULL DEFAULT 'Pending',
            RejectionReason TEXT,
            SubmittedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            ReviewedAt DATETIME,
            ReviewedBy VARCHAR(80),
            StatusViewedAt DATETIME,
            StatusViewCount INT NOT NULL DEFAULT 0,
            UNIQUE KEY uq_registration_reference (ReferenceCode),
            UNIQUE KEY uq_registration_employee (EmployeeID),
            KEY idx_registration_status_submitted (Status,SubmittedAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await db.query('ALTER TABLE registration_requests MODIFY PasswordHash VARCHAR(255) NULL').catch(() => {});
    await db.query('ALTER TABLE registration_requests ADD COLUMN StatusViewedAt DATETIME NULL').catch(() => {});
    await db.query('ALTER TABLE registration_requests ADD COLUMN StatusViewCount INT NOT NULL DEFAULT 0').catch(() => {});
    await db.query('ALTER TABLE Employees ADD COLUMN MustChangePassword TINYINT(1) NOT NULL DEFAULT 0').catch(() => {});
}

function registrationRequestId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function registrationDateFilter(value) {
    if (!value) return '';
    const text = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const date = new Date(`${text}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

router.get('/registration-requests', async (req, res) => {
    try {
        const status = String(req.query.status || 'all').trim();
        const department = String(req.query.department || '').trim();
        const dateFrom = registrationDateFilter(req.query.dateFrom);
        const dateTo = registrationDateFilter(req.query.dateTo);
        const q = String(req.query.q || '').trim().slice(0, 100);
        const allowedStatuses = ['Pending', 'Approved', 'Rejected', 'Cancelled'];
        if (dateFrom === null || dateTo === null || (dateFrom && dateTo && dateFrom > dateTo)) {
            return res.status(400).json({ success: false, message: 'Invalid registration date range.' });
        }
        let sql = `SELECT ID,ReferenceCode,EmployeeID,EmployeeName,Department,Unit,Position,
                          CompanyEmail,Status,RejectionReason,SubmittedAt,UpdatedAt,ReviewedAt,ReviewedBy,
                          StatusViewedAt,StatusViewCount
                   FROM registration_requests WHERE 1=1`;
        const params = [];
        if (status !== 'all') {
            if (!allowedStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid registration status.' });
            sql += ' AND Status=?'; params.push(status);
        }
        if (department) { sql += ' AND Department=?'; params.push(department); }
        if (dateFrom) { sql += ' AND SubmittedAt>=?'; params.push(`${dateFrom} 00:00:00`); }
        if (dateTo) { sql += ' AND SubmittedAt<?'; params.push(`${dateTo} 23:59:59`); }
        if (q) {
            const like = `%${q}%`;
            sql += ' AND (EmployeeID LIKE ? OR EmployeeName LIKE ? OR ReferenceCode LIKE ? OR CompanyEmail LIKE ?)';
            params.push(like, like, like, like);
        }
        const [rows] = await db.query(`${sql} ORDER BY (Status='Pending') DESC,SubmittedAt DESC,ID DESC LIMIT 500`, params);
        const [[summary]] = await db.query(
            `SELECT COUNT(*) total,
                    SUM(Status='Pending') pending,
                    SUM(Status='Approved') approved,
                    SUM(Status='Rejected') rejected,
                    SUM(Status='Cancelled') cancelled,
                    SUM(Status='Pending' AND SubmittedAt<DATE_SUB(NOW(),INTERVAL 3 DAY)) stalePending,
                    ROUND(AVG(CASE WHEN ReviewedAt IS NOT NULL THEN TIMESTAMPDIFF(MINUTE,SubmittedAt,ReviewedAt)/60 END),2) averageReviewHours,
                    SUM(EmployeeName IS NULL OR TRIM(EmployeeName)='' OR Department IS NULL OR TRIM(Department)='' OR Position IS NULL OR TRIM(Position)='') incompleteMaster,
                    SUM(SubmittedAt>=DATE_SUB(NOW(),INTERVAL 1 DAY)) newLast24h
             FROM registration_requests`
        );
        const [[failedSummary]] = await db.query(
            `SELECT COUNT(*) failed24h,COUNT(DISTINCT TargetID) distinctEmployees24h
             FROM Admin_AuditLogs WHERE Module='auth' AND StatusCode>=400 AND ActionTime>=DATE_SUB(NOW(),INTERVAL 1 DAY)`
        ).catch(() => [[{ failed24h: 0, distinctEmployees24h: 0 }]]);
        res.json({
            success: true, data: rows,
            summary: {
                ...summary,
                failedAttempts24h: Number(failedSummary?.failed24h || 0),
                failedEmployees24h: Number(failedSummary?.distinctEmployees24h || 0),
                smtpConfigured: smtpConfigured(),
                cleanupPolicy: {
                    processedRequestRetentionDays: 365,
                    failedAttemptRetentionDays: 90,
                    automaticDelete: false,
                },
            },
        });
    } catch (error) {
        console.warn('[registration] list failed:', error?.message || 'unknown error');
        res.status(500).json({ success: false, message: 'Unable to load registration requests.' });
    }
});

router.post('/registration-requests/:id/approve', async (req, res) => {
    const requestId = registrationRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ success: false, message: 'Invalid registration request ID.' });
    await ensureRegistrationRequestsTable();
    await ensureEmployeeCompanyEmailColumn(db);
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [[request]] = await connection.query('SELECT * FROM registration_requests WHERE ID=? FOR UPDATE', [requestId]);
        if (!request) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Registration request not found.' });
        }
        if (request.Status !== 'Pending') {
            await connection.rollback();
            return res.status(409).json({ success: false, message: `Registration request is already ${request.Status}.` });
        }
        const [[employee]] = await connection.query('SELECT EmployeeID FROM Employees WHERE EmployeeID=? LIMIT 1', [request.EmployeeID]);
        if (employee) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: 'Employee ID already exists in Employee Master.' });
        }
        if (request.CompanyEmail) {
            const [[emailOwner]] = await connection.query('SELECT EmployeeID FROM Employees WHERE LOWER(CompanyEmail)=LOWER(?) LIMIT 1', [request.CompanyEmail]);
            if (emailOwner) {
                await connection.rollback();
                return res.status(409).json({ success: false, message: 'CompanyEmail already belongs to another employee.' });
            }
        }
        const profileWrite = await writeEmployeeProfileWithinTransaction({
            connection,
            operation: CROSS_PATH_OPERATION.CREATE,
            employeeId: request.EmployeeID,
            profilePayload: {
                EmployeeName: String(request.EmployeeName ?? ''),
                Department: String(request.Department ?? ''),
                Unit: String(request.Unit ?? ''),
                Position: String(request.Position ?? ''),
            },
            protectedFields: {
                Team: '',
                CompanyEmail: request.CompanyEmail || null,
                Role: 'User',
                Password: request.PasswordHash,
                MustChangePassword: 0,
            },
        });
        const [reviewResult] = await connection.query(
            `UPDATE registration_requests
             SET Status='Approved',RejectionReason=NULL,PasswordHash=NULL,ReviewedAt=NOW(),ReviewedBy=?
             WHERE ID=? AND Status='Pending'`,
            [req.user?.id || null, request.ID]
        );
        if (reviewResult.affectedRows !== 1) throw new Error('Registration approval state changed before commit.');
        await connection.commit();
        await auditLog(req, 'APPROVE_REGISTRATION_REQUEST', 'RegistrationRequest', String(request.ID),
            `Approved ${request.EmployeeID} and created Employee with Role User.`);
        if (request.CompanyEmail) {
            try {
                const mail = registrationEmailTemplate({
                    status: 'Approved',
                    employeeName: request.EmployeeName,
                    employeeId: request.EmployeeID,
                    referenceCode: request.ReferenceCode,
                    loginUrl: process.env.PUBLIC_UPLOAD_BASE_URL || '',
                });
                const mailResult = await sendMail({
                    to: request.CompanyEmail,
                    ...mail,
                });
                await auditLog(
                    req, 'REGISTRATION_APPROVAL_EMAIL_SENT', 'RegistrationRequest', String(request.ID),
                    mailResult?.skipped ? 'SMTP not configured; email skipped.' : 'Applicant email sent.'
                );
            } catch (mailError) {
                await auditLog(req, 'REGISTRATION_APPROVAL_EMAIL_FAILED', 'RegistrationRequest', String(request.ID), 'Applicant email failed.');
            }
        }
        res.json({
            success: true,
            message: 'Registration approved and Employee account created.',
            onboardingStatus: profileWrite.status,
        });
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.warn('[registration] approval failed:', error?.message || 'unknown error');
        crossPathErrorResponse(res, error, 'Unable to approve registration request.');
    } finally {
        connection.release();
    }
});

router.post('/registration-requests/:id/reject', async (req, res) => {
    const requestId = registrationRequestId(req.params.id);
    if (!requestId) return res.status(400).json({ success: false, message: 'Invalid registration request ID.' });
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3) return res.status(400).json({ success: false, message: 'Rejection reason must contain at least 3 characters.' });
    try {
        await ensureRegistrationRequestsTable();
        const [[registrationRequest]] = await db.query(
            'SELECT ID,ReferenceCode,EmployeeID,EmployeeName,CompanyEmail,Status FROM registration_requests WHERE ID=?',
            [requestId]
        );
        const [result] = await db.query(
            `UPDATE registration_requests
             SET Status='Rejected',RejectionReason=?,PasswordHash=NULL,ReviewedAt=NOW(),ReviewedBy=?
             WHERE ID=? AND Status='Pending'`,
            [reason, req.user?.id || null, requestId]
        );
        if (!result.affectedRows) {
            const [[request]] = await db.query('SELECT Status FROM registration_requests WHERE ID=?', [requestId]);
            if (!request) return res.status(404).json({ success: false, message: 'Registration request not found.' });
            return res.status(409).json({ success: false, message: `Registration request is already ${request.Status}.` });
        }
        await auditLog(req, 'REJECT_REGISTRATION_REQUEST', 'RegistrationRequest', String(requestId), reason);
        if (registrationRequest?.CompanyEmail) {
            try {
                const mail = registrationEmailTemplate({
                    status: 'Rejected',
                    employeeName: registrationRequest.EmployeeName,
                    employeeId: registrationRequest.EmployeeID,
                    referenceCode: registrationRequest.ReferenceCode,
                    reason,
                    loginUrl: process.env.PUBLIC_UPLOAD_BASE_URL || '',
                });
                const mailResult = await sendMail({
                    to: registrationRequest.CompanyEmail,
                    ...mail,
                });
                await auditLog(
                    req, 'REGISTRATION_REJECTION_EMAIL_SENT', 'RegistrationRequest', String(requestId),
                    mailResult?.skipped ? 'SMTP not configured; email skipped.' : 'Applicant email sent.'
                );
            } catch (mailError) {
                await auditLog(req, 'REGISTRATION_REJECTION_EMAIL_FAILED', 'RegistrationRequest', String(requestId), 'Applicant email failed.');
            }
        }
        res.json({ success: true, message: 'Registration request rejected.' });
    } catch (error) {
        console.warn('[registration] rejection failed:', error?.message || 'unknown error');
        res.status(500).json({ success: false, message: 'Unable to reject registration request.' });
    }
});

// GET /admin/employees
router.get('/employees', async (_req, res) => {
    try {
        await ensureEmployeeCompanyEmailColumn(db);
        await ensureAuditTable();
        const [rows] = await db.query(
            `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Team,e.Position,e.CompanyEmail,e.Role,
                    created.ActionTime AS CreatedAt,
                    CASE
                        WHEN created.id IS NULL THEN NULL
                        WHEN LOWER(COALESCE(created.Path,'')) LIKE '%/import%'
                          OR LOWER(COALESCE(created.Detail,'')) LIKE '%source: import%' THEN 'import'
                        ELSE 'manual'
                    END AS CreationSource
             FROM Employees e
             LEFT JOIN (
                 SELECT l.id,l.ActionTime,l.Path,l.Detail,l.TargetID
                 FROM Admin_AuditLogs l
                 INNER JOIN (
                     SELECT MAX(id) AS AuditID
                     FROM Admin_AuditLogs
                     WHERE Action='CREATE_EMPLOYEE'
                       AND COALESCE(TRIM(TargetID),'')<>''
                     GROUP BY LOWER(TRIM(TargetID))
                 ) latest ON latest.AuditID=l.id
             ) created ON LOWER(TRIM(created.TargetID))=LOWER(TRIM(e.EmployeeID))
             ORDER BY e.Department,e.EmployeeName`
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /admin/employee/recent-additions — latest successful Employee Master creates
router.get('/employee/recent-additions', async (req, res) => {
    const limit = Math.max(1, Math.min(20, Number.parseInt(req.query.limit, 10) || 5));
    try {
        await ensureAuditTable();
        const [rows] = await db.query(
            `SELECT l.id AS AuditID,l.ActionTime,l.AdminID,l.AdminName,l.Path,l.Detail,l.TargetID AS EmployeeID,
                    e.EmployeeName,e.Department,e.Unit,e.Position,e.Role,
                    CASE
                        WHEN LOWER(COALESCE(l.Path,'')) LIKE '%/import%'
                          OR LOWER(COALESCE(l.Detail,'')) LIKE '%source: import%' THEN 'import'
                        ELSE 'manual'
                    END AS Source
             FROM Admin_AuditLogs l
             INNER JOIN Employees e
                ON LOWER(TRIM(e.EmployeeID))=LOWER(TRIM(l.TargetID))
             WHERE l.Action='CREATE_EMPLOYEE'
               AND COALESCE(TRIM(l.TargetID),'')<>''
             ORDER BY l.ActionTime DESC,l.id DESC
             LIMIT ?`,
            [limit]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Unable to load recent employee additions.' });
    }
});

// POST /admin/employee/create
router.post('/employee/create', async (req, res) => {
    const { EmployeeID, EmployeeName, Department, Unit, Team, Position, Role, CompanyEmail } = req.body;
    if (!EmployeeID || !EmployeeName) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสและชื่อพนักงาน' });
    }
    const role = ALLOWED_ROLES.includes(Role) ? Role : 'User';
    const emailCheck = validateCompanyEmail(CompanyEmail);
    if (!emailCheck.ok) return res.status(400).json({ success: false, message: emailCheck.message });
    let connection;
    try {
        await ensureEmployeeCompanyEmailColumn(db);
        connection = await db.getConnection();
        const result = await executeEmployeeProfileWrite({
            connection,
            operation: CROSS_PATH_OPERATION.CREATE,
            employeeId: EmployeeID,
            profilePayload: {
                EmployeeName,
                Department: typeof Department === 'string' ? Department : '',
                Unit: typeof Unit === 'string' ? Unit : '',
                Position: typeof Position === 'string' ? Position : '',
            },
            protectedFields: {
                Team: String(Team ?? '').trim(),
                CompanyEmail: emailCheck.email,
                Role: role,
            },
        });
        await auditLog(req, 'CREATE_EMPLOYEE', 'Employee', EmployeeID, `Role: ${role}; onboarding: ${result.status}`);
        res.json({ success: true, message: 'เพิ่มพนักงานเรียบร้อย', onboardingStatus: result.status });
    } catch (err) {
        crossPathErrorResponse(res, err, 'Unable to create employee.');
    } finally {
        connection?.release();
    }
});

// PUT /admin/employee/:id  (เปลี่ยนจาก POST เพื่อ RESTful)
router.put('/employee/:id', async (req, res) => {
    const emailCheck = Object.prototype.hasOwnProperty.call(req.body || {}, 'CompanyEmail')
        ? validateCompanyEmail(req.body.CompanyEmail)
        : { ok: true, email: null };
    if (!emailCheck.ok) return res.status(400).json({ success: false, message: emailCheck.message });
    let connection;
    try {
        await ensureEmployeeCompanyEmailColumn(db);
        connection = await db.getConnection();
        const result = await executeEmployeeProfileWrite({
            connection,
            operation: CROSS_PATH_OPERATION.UPDATE,
            employeeId: req.params.id,
            profilePayload: partialProfilePayload(req.body),
            protectedFields: partialProtectedFields(req.body, emailCheck.email),
        });
        await auditLog(req, 'UPDATE_EMPLOYEE', 'Employee', req.params.id, `Fields: ${result.changedFields.join(',') || 'none'}; onboarding: ${result.status}`);
        res.json({ success: true, message: 'อัปเดตข้อมูลเรียบร้อย', onboardingStatus: result.status, idempotent: result.idempotent });
    } catch (err) {
        crossPathErrorResponse(res, err, 'Unable to update employee.');
    } finally {
        connection?.release();
    }
});

// ── keep legacy POST route as alias so old frontend code still works ──────────
router.post('/employee/update', async (req, res) => {
    const { EmployeeID } = req.body;
    const emailCheck = Object.prototype.hasOwnProperty.call(req.body || {}, 'CompanyEmail')
        ? validateCompanyEmail(req.body.CompanyEmail)
        : { ok: true, email: null };
    if (!emailCheck.ok) return res.status(400).json({ success: false, message: emailCheck.message });
    let connection;
    try {
        await ensureEmployeeCompanyEmailColumn(db);
        connection = await db.getConnection();
        const result = await executeEmployeeProfileWrite({
            connection,
            operation: CROSS_PATH_OPERATION.UPDATE,
            employeeId: EmployeeID,
            profilePayload: partialProfilePayload(req.body),
            protectedFields: partialProtectedFields(req.body, emailCheck.email),
        });
        await auditLog(req, 'UPDATE_EMPLOYEE', 'Employee', EmployeeID, `Fields: ${result.changedFields.join(',') || 'none'}; onboarding: ${result.status}`);
        res.json({ success: true, message: 'อัปเดตข้อมูลเรียบร้อย', onboardingStatus: result.status, idempotent: result.idempotent });
    } catch (err) {
        crossPathErrorResponse(res, err, 'Unable to update employee.');
    } finally {
        connection?.release();
    }
});

// DELETE /admin/employee/:id
router.delete('/employee/:id', async (req, res) => {
    try {
        // ดึงชื่อก่อนลบ เพื่อใส่ใน audit
        const [rows] = await db.query('SELECT EmployeeName FROM Employees WHERE EmployeeID = ?', [req.params.id]);
        const name = rows[0]?.EmployeeName || '?';
        await db.query('DELETE FROM Employees WHERE EmployeeID = ?', [req.params.id]);
        await auditLog(req, 'DELETE_EMPLOYEE', 'Employee', req.params.id, `ชื่อ: ${name}`);
        res.json({ success: true, message: 'ลบข้อมูลเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/employee/:id/reset-password
router.post('/employee/:id/reset-password', async (req, res) => {
    const { newPassword } = req.body;
    if (typeof newPassword !== 'string' || newPassword.length < 4) {
        return res.status(400).json({ success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' });
    }
    try {
        const hashed = await bcrypt.hash(newPassword, 10);
        const [result] = await db.query(
            'UPDATE Employees SET Password = ?, MustChangePassword = 1 WHERE EmployeeID = ?',
            [hashed, req.params.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });
        }
        await auditLog(req, 'RESET_PASSWORD', 'Employee', req.params.id, 'รีเซ็ตรหัสผ่าน');
        res.json({ success: true, message: 'รีเซ็ตรหัสผ่านเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /admin/employee/import-template-data — master lists for Excel template
router.get('/employee/import-template-data', async (_req, res) => {
    try {
        await ensureEmployeeCompanyEmailColumn(db);
        const [[depts], [positions], [units], [teams]] = await Promise.all([
            db.query('SELECT Name FROM Master_Departments ORDER BY Name ASC'),
            db.query('SELECT Name FROM Master_Positions ORDER BY Name ASC'),
            db.query('SELECT name FROM Master_SafetyUnits ORDER BY name ASC'),
            db.query('SELECT Name FROM Master_Teams ORDER BY Name ASC'),
        ]);
        res.json({
            success: true,
            departments: depts.map(r => r.Name),
            positions:   positions.map(r => r.Name),
            units:       units.map(r => r.name),
            teams:       teams.map(r => r.Name),
            roles:       ALLOWED_ROLES,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/employee/import  — Excel bulk import
router.post('/employee/import', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์ Excel' });
    try {
        await ensureEmployeeCompanyEmailColumn(db);
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];
        const data     = xlsx.utils.sheet_to_json(sheet);

        if (data.length === 0) {
            return res.status(400).json({ success: false, message: 'ไฟล์ไม่มีข้อมูล' });
        }

        let addedCount     = 0;
        let duplicateCount = 0;
        let errorCount     = 0;
        const details      = [];   // per-row result for frontend
        const seenEmployeeIds = new Set();
        const addedEmployees = [];

        for (const [rowIndex, row] of data.entries()) {
            const id   = String(row['EmployeeID'] || row['ID']   || row['รหัสพนักงาน'] || '').trim();
            const name = String(row['EmployeeName'] || row['Name'] || row['ชื่อ-นามสกุล'] || '').trim();
            const dept = String(row['Department']   || row['Dept'] || row['แผนก']   || '').trim();
            const unit = String(row['Unit']         || row['หน่วย']                 || '').trim();
            const pos  = String(row['Position']     || row['ตำแหน่ง']               || '').trim();
            const team = String(row['Team']         || row['ทีม']                   || '').trim();
            const rawRole = String(row['Role'] || row['สิทธิ์'] || '').trim();
            const companyEmail = String(row['CompanyEmail'] || row['Company Email'] || row['Email'] || row['อีเมลบริษัท'] || '').trim();
            const role    = ALLOWED_ROLES.includes(rawRole) ? rawRole : 'User';

            if (!id || !name) {
                details.push({ row: rowIndex + 2, id: id || '—', name: name || '—', status: 'skip', code: 'INVALID_EMPLOYEE_PROFILE', reason: 'ไม่มี EmployeeID หรือ EmployeeName' });
                errorCount++;
                continue;
            }

            const normalizedIdKey = id.toLowerCase();
            if (seenEmployeeIds.has(normalizedIdKey)) {
                duplicateCount++;
                details.push({
                    row: rowIndex + 2,
                    id,
                    name,
                    status: 'duplicate',
                    code: 'DUPLICATE_EMPLOYEE_ID_IN_FILE',
                    reason: 'EmployeeID ซ้ำภายในไฟล์ จึงข้ามรายการนี้',
                });
                continue;
            }
            seenEmployeeIds.add(normalizedIdKey);

            const warnings = [];
            if (rawRole && !ALLOWED_ROLES.includes(rawRole)) warnings.push(`Role "${rawRole}" ไม่ถูกต้อง → ใช้ User`);

            const emailCheck = validateCompanyEmail(companyEmail);
            if (!emailCheck.ok) {
                details.push({ row: rowIndex + 2, id, name, status: 'skip', code: 'INVALID_COMPANY_EMAIL', reason: emailCheck.message });
                errorCount++;
                continue;
            }

            let connection;
            try {
                connection = await db.getConnection();
                const write = await executeEmployeeProfileWrite({
                    connection,
                    operation: CROSS_PATH_OPERATION.CREATE,
                    employeeId: id,
                    profilePayload: {
                        EmployeeName: name,
                        Department: dept,
                        Unit: unit,
                        Position: pos,
                    },
                    protectedFields: {
                        Team: team,
                        CompanyEmail: emailCheck.email,
                        Role: role,
                    },
                });
                addedCount++;
                addedEmployees.push(write.employee);
                details.push({
                    row: rowIndex + 2,
                    id,
                    name: write.employee.EmployeeName,
                    status: warnings.length ? 'warn' : 'ok',
                    code: null,
                    reason: warnings.join(' | '),
                    onboardingStatus: write.status,
                });
            } catch (e) {
                if (e instanceof ProfileValidationError && e.code === 'EMPLOYEE_ALREADY_EXISTS') {
                    duplicateCount++;
                    details.push({
                        row: rowIndex + 2,
                        id,
                        name,
                        status: 'duplicate',
                        code: e.code,
                        reason: 'EmployeeID นี้มีอยู่ในระบบแล้ว ระบบไม่ได้แก้ไขข้อมูลเดิม',
                    });
                    continue;
                }
                errorCount++;
                details.push({
                    row: rowIndex + 2,
                    id,
                    name,
                    status: 'error',
                    code: e instanceof ProfileValidationError ? e.code : 'PROFILE_VALIDATION_UNAVAILABLE',
                    reason: e instanceof ProfileValidationError ? e.message : 'Employee profile validation is unavailable.',
                });
            } finally {
                connection?.release();
            }
        }

        for (const employee of addedEmployees) {
            await auditLog(
                req,
                'CREATE_EMPLOYEE',
                'Employee',
                employee.EmployeeID,
                `Source: import_excel; Role: ${employee.Role || 'User'}`
            );
        }
        await auditLog(req, 'IMPORT_EMPLOYEES', 'Employee', null, `เพิ่มใหม่ ${addedCount} / ข้ามซ้ำ ${duplicateCount} / ล้มเหลว ${errorCount}`);
        res.json({
            success: true,
            message: `เพิ่มพนักงานใหม่ ${addedCount} รายการ (ข้ามรายการซ้ำ ${duplicateCount}, ล้มเหลว ${errorCount})`,
            addedCount,
            duplicateCount,
            successCount: addedCount,
            errorCount,
            warnCount: details.filter(d => d.status === 'warn').length,
            details,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /admin/email-requirement-rules
router.get('/email-requirement-rules', async (_req, res) => {
    try {
        const rule = await getEmailRequirementRule({ ensureSchema: false });
        res.json({
            success: true,
            data: {
                ...rule,
                defaultPositionNames: DEFAULT_EMAIL_REQUIRED_POSITION_NAMES,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /admin/email-readiness
router.get('/email-readiness', async (_req, res) => {
    try {
        const readiness = await getEmailReadinessData();
        res.json({ success: true, data: readiness });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /admin/safety-core-export-roster
router.get('/safety-core-export-roster', async (_req, res) => {
    try {
        const rows = await getSafetyCoreExportRoster();
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/safety-core-export-roster
router.post('/safety-core-export-roster', async (req, res) => {
    const employeeIds = parseSafetyCoreRosterEmployeeIds(req.body);
    if (!employeeIds.length) {
        return res.status(400).json({ success: false, message: 'EmployeeID is required.' });
    }
    if (employeeIds.length > 500) {
        return res.status(400).json({ success: false, message: 'Too many EmployeeIDs in one request.' });
    }
    try {
        await ensureSafetyCoreExportRosterTable();
        const placeholders = employeeIds.map(() => '?').join(',');
        const [employees] = await db.query(
            `SELECT EmployeeID FROM Employees WHERE EmployeeID IN (${placeholders})`,
            employeeIds
        );
        const found = new Set((employees || []).map(row => String(row.EmployeeID || '')));
        const missing = employeeIds.filter(id => !found.has(id));
        const validIds = employeeIds.filter(id => found.has(id));
        if (!validIds.length) {
            return res.status(404).json({ success: false, message: 'Employee not found in Employee Master.' });
        }

        const conn = await db.getConnection();
        const adminId = req.user?.id || null;
        const summary = { added: 0, reactivated: 0, already: 0, missing };
        try {
            await conn.beginTransaction();
            const [[orderRow]] = await conn.query(
                'SELECT COALESCE(MAX(SortOrder), 0) + 10 AS nextOrder FROM Safety_Core_Export_Roster WHERE IsActive = 1'
            );
            let nextOrder = Number(orderRow?.nextOrder || 10);
            const existingPlaceholders = validIds.map(() => '?').join(',');
            const [existingRows] = await conn.query(
                `SELECT id, EmployeeID, IsActive FROM Safety_Core_Export_Roster WHERE EmployeeID IN (${existingPlaceholders})`,
                validIds
            );
            const existingById = new Map((existingRows || []).map(row => [String(row.EmployeeID || ''), row]));

            for (const employeeId of validIds) {
                const row = existingById.get(employeeId);
                if (row && Number(row.IsActive) === 1) {
                    summary.already++;
                    continue;
                }
                if (row) {
                    await conn.query(
                        'UPDATE Safety_Core_Export_Roster SET IsActive = 1, SortOrder = ?, UpdatedBy = ? WHERE id = ?',
                        [nextOrder, adminId, row.id]
                    );
                    summary.reactivated++;
                } else {
                    await conn.query(
                        `INSERT INTO Safety_Core_Export_Roster (EmployeeID, SortOrder, CreatedBy, UpdatedBy)
                         VALUES (?, ?, ?, ?)`,
                        [employeeId, nextOrder, adminId, adminId]
                    );
                    summary.added++;
                }
                nextOrder += 10;
            }
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
        await auditLog(
            req,
            'SAFETY_CORE_EXPORT_ROSTER_ADD',
            'Safety_Core_Export_Roster',
            validIds.join(','),
            `Added ${summary.added}, reactivated ${summary.reactivated}, already ${summary.already}, missing ${summary.missing.length} Safety Core export roster employees.`
        );
        const data = await getSafetyCoreExportRoster();
        const changed = summary.added + summary.reactivated;
        const parts = [];
        if (changed) parts.push(`${changed} employee(s) added to export roster.`);
        if (summary.already) parts.push(`${summary.already} already in roster.`);
        if (summary.missing.length) parts.push(`${summary.missing.length} not found in Employee Master.`);
        res.json({ success: true, data, summary, message: parts.join(' ') || 'Employee is already in export roster.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /admin/safety-core-export-roster/reorder
router.put('/safety-core-export-roster/reorder', async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const normalized = items
        .map(item => ({ id: Number(item.id ?? item.RosterID), SortOrder: Number(item.SortOrder) }))
        .filter(item => Number.isInteger(item.id) && item.id > 0 && Number.isInteger(item.SortOrder) && item.SortOrder > 0);
    if (!normalized.length || normalized.length !== items.length) {
        return res.status(400).json({ success: false, message: 'Invalid reorder payload.' });
    }
    const conn = await db.getConnection();
    try {
        await ensureSafetyCoreExportRosterTable();
        await conn.beginTransaction();
        for (const item of normalized) {
            await conn.query(
                'UPDATE Safety_Core_Export_Roster SET SortOrder = ?, UpdatedBy = ? WHERE id = ? AND IsActive = 1',
                [item.SortOrder, req.user?.id || null, item.id]
            );
        }
        await conn.commit();
        await auditLog(req, 'SAFETY_CORE_EXPORT_ROSTER_REORDER', 'Safety_Core_Export_Roster', 'bulk', `Reordered ${normalized.length} export roster rows.`);
        const data = await getSafetyCoreExportRoster();
        res.json({ success: true, data, message: 'Export roster order updated.' });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        conn.release();
    }
});

// PUT /admin/safety-core-export-roster/:id
router.put('/safety-core-export-roster/:id', async (req, res) => {
    const id = Number(req.params.id);
    const sortOrder = Number(req.body?.SortOrder);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(sortOrder) || sortOrder <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid roster row.' });
    }
    try {
        await ensureSafetyCoreExportRosterTable();
        const [result] = await db.query(
            'UPDATE Safety_Core_Export_Roster SET SortOrder = ?, UpdatedBy = ? WHERE id = ? AND IsActive = 1',
            [sortOrder, req.user?.id || null, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Roster row not found.' });
        }
        const data = await getSafetyCoreExportRoster();
        res.json({ success: true, data, message: 'Export roster row updated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /admin/safety-core-export-roster/:id
router.delete('/safety-core-export-roster/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid roster row.' });
    }
    try {
        await ensureSafetyCoreExportRosterTable();
        const [result] = await db.query(
            'UPDATE Safety_Core_Export_Roster SET IsActive = 0, UpdatedBy = ? WHERE id = ? AND IsActive = 1',
            [req.user?.id || null, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Roster row not found.' });
        }
        await auditLog(req, 'SAFETY_CORE_EXPORT_ROSTER_REMOVE', 'Safety_Core_Export_Roster', String(id), 'Removed employee from Safety Core export roster.');
        const data = await getSafetyCoreExportRoster();
        res.json({ success: true, data, message: 'Employee removed from export roster.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /admin/safety-core-data
router.get('/safety-core-data', async (req, res) => {
    try {
        const year = clampSafetyCoreYear(req.query.year);
        const month = clampSafetyCoreMonth(req.query.month);
        const data = await getSafetyCoreData({ year, month });
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /admin/email-requirement-rules
router.put('/email-requirement-rules', async (req, res) => {
    const requestedIds = Array.isArray(req.body?.positionIds)
        ? [...new Set(req.body.positionIds.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))]
        : [];
    try {
        await ensureAppSettingsTable();
        const [positions] = await db.query('SELECT id FROM Master_Positions');
        const availableIds = new Set(positions.map(position => Number(position.id)));
        const invalidIds = requestedIds.filter(id => !availableIds.has(id));
        if (invalidIds.length) {
            return res.status(400).json({ success: false, message: 'Position rule contains unknown Master Position IDs.' });
        }
        await db.query(
            `INSERT INTO App_Settings (key_name, value) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value), UpdatedAt = NOW()`,
            [EMAIL_REQUIREMENT_SETTING_KEY, JSON.stringify({
                positionIds: requestedIds,
                updatedBy: req.user?.id || null,
                updatedAt: new Date().toISOString(),
            })]
        );
        await auditLog(
            req,
            'UPDATE_EMAIL_REQUIREMENT_RULE',
            'App_Setting',
            EMAIL_REQUIREMENT_SETTING_KEY,
            `Required email positions: ${requestedIds.length}`
        );
        const rule = await getEmailRequirementRule();
        res.json({ success: true, data: rule, message: 'Email requirement rule updated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =============================================================================
// SCHEDULES
// =============================================================================

// GET /admin/schedules
router.get('/schedules', async (_req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM patrol_schedule ORDER BY ScheduledDate DESC');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/schedule/create  — สร้างทีละวัน
router.post('/schedule/create', async (req, res) => {
    const { ScheduledDate, Teams } = req.body;
    if (!ScheduledDate || !Array.isArray(Teams) || Teams.length === 0) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่และทีม' });
    }
    try {
        for (const team of Teams) {
            await db.query(
                "INSERT INTO patrol_schedule (ScheduledDate, TeamName, Status) VALUES (?, ?, 'Pending')",
                [ScheduledDate, team]
            );
        }
        await auditLog(req, 'CREATE_SCHEDULE', 'Schedule', null, `วันที่: ${ScheduledDate}, ทีม: ${Teams.join(', ')}`);
        res.json({ success: true, message: `จัดตารางสำหรับวันที่ ${ScheduledDate} เรียบร้อย` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /admin/schedule/bulk-create  — สร้างหลายวันพร้อมกัน (range / repeat)
router.post('/schedule/bulk-create', async (req, res) => {
    // dates: string[] เช่น ['2026-03-01','2026-03-08','2026-03-15']
    // Teams: string[]
    const { dates, Teams } = req.body;
    if (!Array.isArray(dates) || dates.length === 0 || !Array.isArray(Teams) || Teams.length === 0) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่และทีม' });
    }
    try {
        let created = 0;
        for (const date of dates) {
            for (const team of Teams) {
                await db.query(
                    "INSERT INTO patrol_schedule (ScheduledDate, TeamName, Status) VALUES (?, ?, 'Pending')",
                    [date, team]
                );
                created++;
            }
        }
        await auditLog(req, 'BULK_CREATE_SCHEDULE', 'Schedule', null, `${created} รายการ, ${dates.length} วัน`);
        res.json({ success: true, message: `สร้างตารางเวร ${created} รายการ (${dates.length} วัน)` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /admin/schedule/:id
router.delete('/schedule/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM patrol_schedule WHERE ScheduleID = ?', [req.params.id]);
        await auditLog(req, 'DELETE_SCHEDULE', 'Schedule', req.params.id, null);
        res.json({ success: true, message: 'ลบรายการเรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =============================================================================
// AUDIT LOGS
// =============================================================================

// GET /admin/audit-logs?page=1&limit=50&action=&adminId=&module=&q=&dateFrom=&dateTo=
router.get('/audit-logs', async (req, res) => {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    const action  = req.query.action   || '';
    const adminId = req.query.adminId  || '';
    const module  = req.query.module   || '';
    const q        = String(req.query.q || '').trim();
    const dateFrom = req.query.dateFrom || '';
    const dateTo   = req.query.dateTo   || '';
    const failed   = req.query.failed  === '1';

    try {
        let where = 'WHERE 1=1';
        const params = [];
        if (action)  { where += ' AND Action = ?';   params.push(action); }
        if (adminId) { where += ' AND AdminID = ?';  params.push(adminId); }
        if (module)  { where += ' AND Module = ?';   params.push(module); }
        if (failed)  { where += ' AND (StatusCode >= 400 OR Action LIKE ?)'; params.push('FAILED%'); }
        if (q) {
            where += ` AND (
                AdminName LIKE ? OR AdminID LIKE ? OR Action LIKE ? OR TargetType LIKE ?
                OR TargetID LIKE ? OR Detail LIKE ? OR Path LIKE ?
            )`;
            const like = `%${q}%`;
            params.push(like, like, like, like, like, like, like);
        }
        if (dateFrom) { where += ' AND ActionTime >= ?'; params.push(dateFrom); }
        if (dateTo)   { where += ' AND ActionTime < DATE_ADD(?, INTERVAL 1 DAY)'; params.push(dateTo); }

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total FROM Admin_AuditLogs ${where}`, params
        );
        const [rows] = await db.query(
            `SELECT * FROM Admin_AuditLogs ${where} ORDER BY ActionTime DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        const [modules] = await db.query(
            `SELECT DISTINCT Module FROM Admin_AuditLogs
             WHERE Module IS NOT NULL AND Module <> ''
             ORDER BY Module`
        );
        const [actions] = await db.query(
            `SELECT DISTINCT Action FROM Admin_AuditLogs
             WHERE Action IS NOT NULL AND Action <> ''
             ORDER BY Action`
        );
        res.json({
            success: true,
            data: rows,
            total,
            page,
            limit,
            facets: {
                modules: modules.map(r => r.Module),
                actions: actions.map(r => r.Action),
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =============================================================================
// DASHBOARD STATS
// =============================================================================

// GET /admin/dashboard-stats
router.get('/dashboard-stats', async (_req, res) => {
    try {
        const safeScalar = async (sql, fallback = 0) => {
            try {
                const [[row]] = await db.query(sql);
                return row?.total ?? row?.cnt ?? fallback;
            } catch {
                return fallback;
            }
        };
        const safeRows = async (sql) => {
            try {
                const [rows] = await db.query(sql);
                return rows;
            } catch {
                return [];
            }
        };

        const [[empRow]]       = await db.query('SELECT COUNT(*) AS total FROM Employees');
        const [[schedRow]]     = await db.query("SELECT COUNT(*) AS total FROM Patrol_Sessions WHERE MONTH(ScheduledDate)=MONTH(NOW()) AND YEAR(ScheduledDate)=YEAR(NOW())").catch(() => [[{ total: 0 }]]);
        const [[pendRow]]      = await db.query("SELECT COUNT(*) AS total FROM Patrol_Sessions WHERE Status='Pending' AND ScheduledDate >= CURDATE()").catch(() => [[{ total: 0 }]]);
        const [[hiyariRow]]    = await db.query('SELECT COUNT(*) AS total FROM HiyariReports WHERE Status != "Closed"').catch(() => [[{ total: 0 }]]);
        const [[kyRow]]        = await db.query('SELECT COUNT(*) AS total FROM KY_Activities WHERE MONTH(ActivityDate)=MONTH(NOW()) AND YEAR(ActivityDate)=YEAR(NOW())').catch(() => [[{ total: 0 }]]);
        const [[fourmRow]]     = await db.query("SELECT COUNT(*) AS total FROM FourM_ChangeNotices WHERE Status='Open'").catch(() => [[{ total: 0 }]]);
        const [[auditRow]]     = await db.query("SELECT COUNT(*) AS total FROM Admin_AuditLogs WHERE DATE(ActionTime)=CURDATE()").catch(() => [[{ total: 0 }]]);
        const [[failedAuditRow]] = await db.query("SELECT COUNT(*) AS total FROM Admin_AuditLogs WHERE ActionTime >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND (Action LIKE 'FAILED_%' OR StatusCode >= 400)").catch(() => [[{ total: 0 }]]);

        // dept breakdown
        const [deptRows] = await db.query(
            'SELECT Department, COUNT(*) AS cnt FROM Employees GROUP BY Department ORDER BY cnt DESC LIMIT 10'
        );

        // recent audit (5 items)
        const [recentAudit] = await db.query(
            'SELECT * FROM Admin_AuditLogs ORDER BY ActionTime DESC LIMIT 5'
        ).catch(() => [[]]);

        const [
            staleChangeNotices,
            staleHiyari,
            overduePatrolIssues,
            overdueTrainingRecords,
            pendingYokoten,
            incompleteProfiles,
            missingActivityTargets,
        ] = await Promise.all([
            safeRows("SELECT id, NoticeNo, Department, ChangeDate FROM FourM_ChangeNotices WHERE Status='Open' AND DATEDIFF(NOW(), ChangeDate) > 30 ORDER BY ChangeDate ASC LIMIT 5"),
            safeRows("SELECT id, Department, ReportDate FROM HiyariReports WHERE Status != 'Closed' AND DATEDIFF(NOW(), ReportDate) > 14 ORDER BY ReportDate ASC LIMIT 5"),
            safeRows("SELECT id, Area, IssueDetail, CreatedAt FROM Patrol_Issues WHERE (Status IS NULL OR Status NOT IN ('Closed','Completed')) AND DATEDIFF(NOW(), CreatedAt) > 14 ORDER BY CreatedAt ASC LIMIT 5"),
            safeScalar("SELECT COUNT(*) AS total FROM Training_Records WHERE ExpiryDate IS NOT NULL AND ExpiryDate < CURDATE()"),
            safeScalar("SELECT COUNT(*) AS total FROM YokotenResponses WHERE Status IN ('Pending','Submitted','Waiting')"),
            safeScalar("SELECT COUNT(*) AS total FROM Employees WHERE COALESCE(Department,'')='' OR COALESCE(Position,'')=''"),
            getCoverageMatrix().then(data => data.summary.missing).catch(() => 0),
        ]);

        const actionRequired = [
            {
                key: 'patrol_issues',
                label: 'Patrol issues overdue',
                count: overduePatrolIssues.length,
                severity: overduePatrolIssues.length ? 'high' : 'ok',
                tab: 'health',
                items: overduePatrolIssues,
            },
            {
                key: 'change_notices',
                label: '4M Change Notice older than 30 days',
                count: staleChangeNotices.length,
                severity: staleChangeNotices.length ? 'high' : 'ok',
                tab: 'health',
                items: staleChangeNotices,
            },
            {
                key: 'hiyari',
                label: 'Hiyari open longer than 14 days',
                count: staleHiyari.length,
                severity: staleHiyari.length ? 'medium' : 'ok',
                tab: 'health',
                items: staleHiyari,
            },
            {
                key: 'training',
                label: 'Training records expired',
                count: overdueTrainingRecords,
                severity: overdueTrainingRecords ? 'medium' : 'ok',
                tab: 'health',
                items: [],
            },
            {
                key: 'yokoten',
                label: 'Yokoten responses pending review',
                count: pendingYokoten,
                severity: pendingYokoten ? 'medium' : 'ok',
                tab: 'health',
                items: [],
            },
            {
                key: 'profiles',
                label: 'Employee profiles missing department/position',
                count: incompleteProfiles,
                severity: incompleteProfiles ? 'medium' : 'ok',
                tab: 'employees',
                items: [],
            },
            {
                key: 'targets',
                label: 'Activity target slots without effective source',
                count: missingActivityTargets,
                severity: missingActivityTargets ? 'low' : 'ok',
                tab: 'targets',
                items: [],
            },
            {
                key: 'audit_failures',
                label: 'Failed API actions in last 7 days',
                count: failedAuditRow.total,
                severity: failedAuditRow.total ? 'high' : 'ok',
                tab: 'audit',
                items: [],
            },
        ];

        const uxHealth = {
            score: Math.max(0, 100 - actionRequired.reduce((sum, item) => {
                const weight = item.severity === 'high' ? 8 : item.severity === 'medium' ? 5 : item.severity === 'low' ? 2 : 0;
                return sum + Math.min(item.count, 10) * weight;
            }, 0)),
            high: actionRequired.filter(i => i.severity === 'high' && i.count > 0).length,
            medium: actionRequired.filter(i => i.severity === 'medium' && i.count > 0).length,
            low: actionRequired.filter(i => i.severity === 'low' && i.count > 0).length,
        };

        res.json({
            success: true,
            data: {
                totalEmployees:    empRow.total,
                schedulesThisMonth: schedRow.total,
                pendingSchedules:  pendRow.total,
                openHiyari:        hiyariRow.total,
                kyThisMonth:       kyRow.total,
                openChangeNotices: fourmRow.total,
                auditToday:        auditRow.total,
                deptBreakdown:     deptRows,
                recentAudit,
                actionRequired,
                uxHealth,
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =============================================================================
// SYSTEM HEALTH
// =============================================================================

router.get('/system-health/snapshots', async (req, res) => {
    try {
        const limit = Number(req.query.limit || 48);
        res.json({ success: true, data: await getSystemHealthSnapshotHistory(limit) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/system-health/snapshots', async (req, res) => {
    try {
        const health = req.body?.health;
        if (!health || typeof health !== 'object') {
            return res.status(400).json({ success: false, message: 'health payload is required' });
        }
        const snapshot = await insertSystemHealthSnapshot(health, req.user || {}, req.body?.source || 'manual');
        const history = await getSystemHealthSnapshotHistory(48);
        res.json({ success: true, data: { snapshot, history }, message: 'System Health snapshot saved.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /admin/system-health
router.get('/system-health', async (_req, res) => {
    const safeCount = async (sql) => {
        try { const [[r]] = await db.query(sql); return r.total ?? r.cnt ?? 0; }
        catch { return null; } // null = table not exist yet
    };

    try {
        const [
            empTotal, deptTotal, teamTotal,
            patrolSessions, patrolIssues,
            hiyariOpen, hiyariTotal,
            kyTotal,
            fourmOpen, fourmTotal,
            manRecords,
            contractorDocs,
            ojtDocs,
            yokotenTopics,
            auditTotal,
            audit24h,
            failedApi24h,
        ] = await Promise.all([
            safeCount('SELECT COUNT(*) AS total FROM Employees'),
            safeCount('SELECT COUNT(*) AS total FROM Master_Departments'),
            safeCount('SELECT COUNT(*) AS total FROM Master_Teams'),
            safeCount('SELECT COUNT(*) AS total FROM Patrol_Sessions'),
            safeCount('SELECT COUNT(*) AS total FROM Patrol_Issues'),
            safeCount("SELECT COUNT(*) AS total FROM HiyariReports WHERE Status != 'Closed'"),
            safeCount('SELECT COUNT(*) AS total FROM HiyariReports'),
            safeCount('SELECT COUNT(*) AS total FROM KY_Activities'),
            safeCount("SELECT COUNT(*) AS total FROM FourM_ChangeNotices WHERE Status='Open'"),
            safeCount('SELECT COUNT(*) AS total FROM FourM_ChangeNotices'),
            safeCount('SELECT COUNT(*) AS total FROM FourM_ManRecords'),
            safeCount('SELECT COUNT(*) AS total FROM Contractor_Documents'),
            safeCount('SELECT COUNT(*) AS total FROM SCW_Documents'),
            safeCount('SELECT COUNT(*) AS total FROM YokotenTopics'),
            safeCount('SELECT COUNT(*) AS total FROM Admin_AuditLogs'),
            safeCount('SELECT COUNT(*) AS total FROM Admin_AuditLogs WHERE ActionTime >= DATE_SUB(NOW(), INTERVAL 1 DAY)'),
            safeCount("SELECT COUNT(*) AS total FROM Admin_AuditLogs WHERE ActionTime >= DATE_SUB(NOW(), INTERVAL 1 DAY) AND (StatusCode >= 400 OR Action LIKE 'FAILED%')"),
        ]);

        // Change notices ค้างนาน (> 30 วัน)
        const [staleNotices] = await db.query(
            "SELECT id, NoticeNo, Department, ChangeDate FROM FourM_ChangeNotices WHERE Status='Open' AND DATEDIFF(NOW(), ChangeDate) > 30 ORDER BY ChangeDate ASC LIMIT 10"
        ).catch(() => [[]]);

        // Hiyari ค้างนาน (> 14 วัน)
        const [staleHiyari] = await db.query(
            "SELECT id, Department, ReportDate FROM HiyariReports WHERE Status != 'Closed' AND DATEDIFF(NOW(), ReportDate) > 14 ORDER BY ReportDate ASC LIMIT 10"
        ).catch(() => [[]]);

        const moduleHealth = await buildSystemHealthModuleMap();
        const workflowRules = await buildSystemHealthWorkflowRules();
        const storageHealth = await buildSystemStorageHealth();
        const securityHealth = await buildSystemSecurityHealth();
        const versionHealth = buildSystemVersionHealth();
        const criticalModules = moduleHealth.filter(module => module.status === 'critical');
        const warningModules = moduleHealth.filter(module => module.status === 'warning');
        const allMissingTables = moduleHealth.flatMap(module => module.missingTables.map(table => `${module.label}: ${table}`));
        const allMissingRequiredTables = moduleHealth.flatMap(module => (module.missingRequiredTables || []).map(table => `${module.label}: ${table}`));
        const allMissingOptionalTables = moduleHealth.flatMap(module => (module.missingOptionalTables || []).map(table => `${module.label}: ${table}`));
        const allMissingBacklogTables = moduleHealth.flatMap(module => (module.missingBacklogTables || []).map(table => `${module.label}: ${table}`));
        const allMissingColumns = moduleHealth.flatMap(module => module.missingColumns.map(column => `${module.label}: ${column}`));
        const totalTables = moduleHealth.reduce((sum, module) => sum + module.tableCount, 0);
        const existingTables = moduleHealth.reduce((sum, module) => sum + module.existingTables, 0);
        const totalApiSurfaces = moduleHealth.reduce((sum, module) => sum + module.apiCount, 0);
        const failedApiByModule24h = moduleHealth.reduce((sum, module) => sum + Number(module.failedApi24h || 0), 0);

        const moduleCounts = {
            Employees: empTotal,
            Master_Departments: deptTotal,
            Master_Teams: teamTotal,
            Patrol_Sessions: patrolSessions,
            Patrol_Issues: patrolIssues,
            HiyariReports: hiyariTotal,
            KY_Activities: kyTotal,
            FourM_ChangeNotices: fourmTotal,
            FourM_ManRecords: manRecords,
            Contractor_Documents: contractorDocs,
            SCW_Documents: ojtDocs,
            YokotenTopics: yokotenTopics,
            Admin_AuditLogs: auditTotal,
        };
        const missingTables = Object.entries(moduleCounts)
            .filter(([, value]) => value === null)
            .map(([key]) => key);
        const signals = [
            {
                key: 'missing_required_tables',
                label: 'Required module tables missing or unreadable',
                count: allMissingRequiredTables.length || missingTables.length,
                severity: (allMissingRequiredTables.length || missingTables.length) ? 'high' : 'ok',
                detail: allMissingRequiredTables.length ? allMissingRequiredTables : missingTables,
                penalty: 12,
            },
            {
                key: 'missing_optional_tables',
                label: 'Optional module tables not available',
                count: allMissingOptionalTables.length,
                severity: allMissingOptionalTables.length ? 'low' : 'ok',
                detail: allMissingOptionalTables,
                penalty: 1,
            },
            {
                key: 'backlog_tables',
                label: 'Backlog tables not yet available',
                count: allMissingBacklogTables.length,
                severity: allMissingBacklogTables.length ? 'info' : 'ok',
                detail: allMissingBacklogTables,
                penalty: 0,
            },
            {
                key: 'missing_columns',
                label: 'Missing expected schema columns',
                count: allMissingColumns.length,
                severity: allMissingColumns.length ? 'high' : 'ok',
                detail: allMissingColumns,
            },
            {
                key: 'module_coverage',
                label: 'Modules needing review',
                count: criticalModules.length + warningModules.length,
                severity: criticalModules.length ? 'high' : warningModules.length ? 'medium' : 'ok',
                detail: moduleHealth
                    .filter(module => module.status !== 'ok')
                    .map(module => `${module.label}: ${module.status}`),
                penalty: 0,
            },
            {
                key: 'failed_api_24h',
                label: 'Failed API actions in last 24h',
                count: failedApiByModule24h || failedApi24h || 0,
                severity: (failedApiByModule24h || failedApi24h) >= 10 ? 'high' : (failedApiByModule24h || failedApi24h) ? 'medium' : 'ok',
                detail: [],
                penalty: (failedApiByModule24h || failedApi24h) >= 10 ? 10 : (failedApiByModule24h || failedApi24h) ? 4 : 0,
            },
            {
                key: 'employee_master',
                label: 'Employee and department master data',
                count: (!empTotal || !deptTotal) ? 1 : 0,
                severity: (!empTotal || !deptTotal) ? 'high' : 'ok',
                detail: [],
                penalty: 15,
            },
            {
                key: 'storage_missing_files',
                label: 'Upload records with missing local files',
                count: Number(storageHealth.missingFiles || 0),
                severity: storageHealth.missingFiles ? 'medium' : 'ok',
                detail: (storageHealth.missingDetails || []).map(item => `${item.source || 'File'} #${item.recordId || '-'}: ${item.filename || '-'}`),
                penalty: storageHealth.missingFiles ? Math.min(8, 2 + Number(storageHealth.missingFiles)) : 0,
            },
            {
                key: 'storage_orphan_files',
                label: 'Unreferenced files in upload storage',
                count: Number(storageHealth.orphanFiles || 0),
                severity: storageHealth.orphanFiles ? 'low' : 'ok',
                detail: (storageHealth.orphanDetails || []).slice(0, 20),
                penalty: 0,
            },
            {
                key: 'security_legacy_passwords',
                label: 'Accounts still using legacy passwords',
                count: Number(securityHealth.auth.legacyPasswords || 0),
                severity: securityHealth.auth.legacyPasswords ? 'high' : 'ok',
                detail: [],
                penalty: securityHealth.auth.legacyPasswords ? 6 : 0,
            },
            {
                key: 'security_profile_gaps',
                label: 'Employee profiles missing department',
                count: Number(securityHealth.users.missingDepartment || 0),
                severity: securityHealth.users.missingDepartment ? 'medium' : 'ok',
                detail: [],
                penalty: securityHealth.users.missingDepartment ? 2 : 0,
            },
            {
                key: 'security_failed_logins',
                label: 'Failed login attempts in 24h',
                count: Number(securityHealth.auth.failedLogins24h || 0),
                severity: securityHealth.auth.failedLogins24h >= 20 ? 'high' : securityHealth.auth.failedLogins24h ? 'low' : 'ok',
                detail: [],
                penalty: securityHealth.auth.failedLogins24h >= 20 ? 4 : 0,
            },
            {
                key: 'deploy_version_drift',
                label: 'Deploy manifest/runtime parity needs review',
                count: versionHealth.status === 'ok' ? 0 : 1,
                severity: versionHealth.status === 'critical' ? 'high' : versionHealth.status === 'warning' ? 'low' : 'ok',
                detail: [],
                penalty: versionHealth.status === 'critical' ? 6 : 0,
            },
        ];
        workflowRules.forEach(rule => {
            signals.push({
                key: rule.key,
                module: rule.module,
                label: rule.label,
                count: rule.count,
                severity: rule.count ? rule.severity : 'ok',
                detail: [],
                slaDays: rule.slaDays,
                available: rule.available,
                penalty: rule.count ? Math.min(Number(rule.penalty || 0), 8) : 0,
            });
        });
        const scoreBreakdown = [];
        let score = 100;
        signals.forEach(signal => {
            if (!signal.count || !signal.penalty) return;
            const deduction = ['missing_required_tables', 'missing_columns'].includes(signal.key)
                ? Math.min(24, Math.min(Number(signal.count), 2) * Number(signal.penalty))
                : Number(signal.penalty);
            score -= deduction;
            scoreBreakdown.push({ key: signal.key, label: signal.label, deduction });
        });
        score = Math.max(25, score);

        res.json({
            success: true,
            data: {
                coverage: {
                    modulesTotal: moduleHealth.length,
                    modulesOk: moduleHealth.filter(module => module.status === 'ok').length,
                    modulesWarning: warningModules.length,
                    modulesCritical: criticalModules.length,
                    tablesTotal: totalTables,
                    tablesOk: existingTables,
                    tablesMissing: Math.max(0, totalTables - existingTables),
                    requiredTablesMissing: allMissingRequiredTables.length,
                    optionalTablesMissing: allMissingOptionalTables.length,
                    backlogTablesMissing: allMissingBacklogTables.length,
                    apiSurfacesTotal: totalApiSurfaces,
                    failedApiByModule24h,
                    phases: ['coverage_map', 'database_schema_health', 'api_surface_health', 'workflow_health', 'health_rules_tuning', 'storage_file_health', 'permission_security_health', 'deploy_version_health', 'automation_scheduled_snapshot'],
                },
                moduleHealth,
                workflowHealth: {
                    rules: workflowRules,
                    active: workflowRules.filter(rule => rule.count > 0).length,
                    phase4Complete: false,
                    phase4Gaps: [
                        'Patrol missed/unreviewed attendance detail',
                        'CCCF target mismatch validation',
                        'Contractor pending approval',
                        'Safety Culture PPE issue aging',
                    ],
                },
                storageHealth,
                securityHealth,
                versionHealth,
                apiHealth: {
                    surfacesTotal: totalApiSurfaces,
                    failed24h: failedApiByModule24h || failedApi24h || 0,
                    modulesWithFailures: moduleHealth
                        .filter(module => Number(module.failedApi24h || 0) > 0)
                        .map(module => ({ key: module.key, label: module.label, failed24h: module.failedApi24h })),
                },
                modules: {
                    employees:    { total: empTotal, depts: deptTotal, teams: teamTotal },
                    patrol:       { sessions: patrolSessions, issues: patrolIssues },
                    hiyari:       { total: hiyariTotal, open: hiyariOpen },
                    ky:           { total: kyTotal },
                    fourm:        { total: fourmTotal, open: fourmOpen, manRecords },
                    contractor:   { docs: contractorDocs },
                    ojt:          { docs: ojtDocs },
                    yokoten:      { topics: yokotenTopics },
                },
                alerts: {
                    staleChangeNotices: staleNotices,
                    staleHiyari,
                },
                audit: {
                    total: auditTotal,
                    last24h: audit24h,
                    failed24h: failedApi24h,
                },
                readiness: {
                    score,
                    status: score >= 90 ? 'Ready' : score >= 70 ? 'Monitor' : 'Action Needed',
                    signals,
                    scoreFloor: 25,
                    scoreBreakdown,
                    missingTables,
                },
                snapshotHealth: await getSystemHealthSnapshotHistory(48),
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =============================================================================
// ORGANIZATION — departments + safety units
// =============================================================================

// One-time migration guard
let _orgTablesReady = false;
async function ensureOrgTables() {
    if (_orgTablesReady) return;

    // Add is_safety_core to Master_Departments if missing
    try {
        await db.query('ALTER TABLE Master_Departments ADD COLUMN is_safety_core TINYINT NOT NULL DEFAULT 0');
    } catch (_) { /* column already exists */ }

    // Safety Units table
    await db.query(`
        CREATE TABLE IF NOT EXISTS Master_SafetyUnits (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            name          VARCHAR(100) NOT NULL,
            short_code    VARCHAR(30),
            department_id INT NOT NULL,
            sort_order    INT DEFAULT 0,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_unit_dept (name, department_id),
            INDEX idx_dept (department_id)
        )
    `);

    _orgTablesReady = true;
}

// ─── GET /admin/org/departments ──────────────────────────────────────────────
router.get('/org/departments', async (_req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT d.id, d.Name, d.is_safety_core,
                   COUNT(u.id) AS unit_count
            FROM   Master_Departments d
            LEFT JOIN Master_SafetyUnits u ON u.department_id = d.id
            GROUP BY d.id, d.Name, d.is_safety_core
            ORDER BY d.Name ASC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /admin/org/departments/:id — toggle is_safety_core + rename ─────────
router.put('/org/departments/:id', async (req, res) => {
    try {
        await ensureOrgTables();
        const { Name, is_safety_core } = req.body;
        if (!Name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อแผนก' });
        const flag = is_safety_core ? 1 : 0;
        await db.query(
            'UPDATE Master_Departments SET Name=?, is_safety_core=? WHERE id=?',
            [Name, flag, req.params.id]
        );
        await auditLog(req, 'UPDATE_DEPT_ORG', 'Department', req.params.id,
            `Name: ${Name}, is_safety_core: ${flag}`);
        res.json({ success: true, message: 'อัปเดตข้อมูลแผนกสำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /admin/org/units  (all) ─────────────────────────────────────────────
router.get('/org/units', async (_req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM Master_SafetyUnits ORDER BY department_id, sort_order, name ASC'
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /admin/org/units/:deptId  (per dept) ────────────────────────────────
router.get('/org/units/:deptId', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM Master_SafetyUnits WHERE department_id=? ORDER BY sort_order, name ASC',
            [req.params.deptId]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /admin/org/units — add unit ────────────────────────────────────────
router.post('/org/units', async (req, res) => {
    try {
        await ensureOrgTables();
        const { name, short_code, department_id, sort_order } = req.body;
        if (!name || !department_id)
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อ unit และ department_id' });
        await db.query(
            'INSERT INTO Master_SafetyUnits (name, short_code, department_id, sort_order) VALUES (?,?,?,?)',
            [name, short_code || '', department_id, parseInt(sort_order) || 0]
        );
        await auditLog(req, 'CREATE_SAFETY_UNIT', 'SafetyUnit', name, `dept: ${department_id}`);
        res.json({ success: true, message: 'เพิ่ม Safety Unit สำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(400).json({ success: false, message: 'ชื่อ unit นี้มีอยู่ใน department แล้ว' });
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /admin/org/units/:id — edit unit ────────────────────────────────────
router.put('/org/units/:id', async (req, res) => {
    try {
        await ensureOrgTables();
        const { name, short_code, sort_order } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อ unit' });
        await db.query(
            'UPDATE Master_SafetyUnits SET name=?, short_code=?, sort_order=? WHERE id=?',
            [name, short_code || '', parseInt(sort_order) || 0, req.params.id]
        );
        await auditLog(req, 'UPDATE_SAFETY_UNIT', 'SafetyUnit', req.params.id, `name: ${name}`);
        res.json({ success: true, message: 'แก้ไข Safety Unit สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── DELETE /admin/org/units/:id — delete unit ───────────────────────────────
router.delete('/org/units/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM Master_SafetyUnits WHERE id=?', [req.params.id]);
        await auditLog(req, 'DELETE_SAFETY_UNIT', 'SafetyUnit', req.params.id, null);
        res.json({ success: true, message: 'ลบ Safety Unit สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =============================================================================
// PERMISSIONS — role matrix + per-user overrides
// =============================================================================

const ALL_PERMISSIONS = [
    'VIEW_DASHBOARD', 'MANAGE_USERS', 'VIEW_REPORT',
    'APPROVE_SAFETY', 'SUBMIT_SAFETY', 'FOURM_TRAINING_MANAGE',
    'FORKLIFT_VIEW', 'FORKLIFT_REQUEST', 'FORKLIFT_APPROVE', 'FORKLIFT_MANAGE', 'FORKLIFT_RENEW', 'FORKLIFT_SUSPEND',
    'FORKLIFT_PRINT', 'FORKLIFT_EXPORT', 'FORKLIFT_DOCUMENT_MANAGE',
    'FORKLIFT_TEMPLATE_MANAGE', 'FORKLIFT_SETTINGS_MANAGE', 'FORKLIFT_AUDIT_VIEW',
];
const ALL_ROLES = ['ADMIN', 'USER', 'VIEWER', 'EXECUTIVE', 'MANAGER', 'STAFF', 'SAFETY_OFFICER'];

// Role display labels
const ROLE_LABELS = {
    ADMIN:          'Admin',
    USER:           'User',
    VIEWER:         'Viewer',
    EXECUTIVE:      'Executive',
    MANAGER:        'Manager',
    STAFF:          'Staff',
    SAFETY_OFFICER: 'Safety Officer',
};

let _permTablesReady = false;
async function ensurePermTables() {
    if (_permTablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS Admin_RolePermissions (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            role       VARCHAR(50)  NOT NULL,
            permission VARCHAR(80)  NOT NULL,
            granted    TINYINT      NOT NULL DEFAULT 1,
            updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_role_perm (role, permission)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS Admin_UserPermissions (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            employee_id VARCHAR(50) NOT NULL,
            permission  VARCHAR(80) NOT NULL,
            granted     TINYINT     NOT NULL DEFAULT 1,
            updated_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_user_perm (employee_id, permission)
        )
    `);

    // Seed defaults: ADMIN gets all; EXECUTIVE gets VIEW_*; MANAGER gets VIEW_* + SUBMIT; STAFF gets SUBMIT; SAFETY_OFFICER gets all except MANAGE_USERS
    const defaults = [
        ['ADMIN',          'VIEW_DASHBOARD', 1],
        ['ADMIN',          'MANAGE_USERS',   1],
        ['ADMIN',          'VIEW_REPORT',    1],
        ['ADMIN',          'APPROVE_SAFETY', 1],
        ['ADMIN',          'SUBMIT_SAFETY',  1],
        ['ADMIN',          'FOURM_TRAINING_MANAGE', 1],
        ['USER',           'VIEW_DASHBOARD', 1],
        ['USER',           'SUBMIT_SAFETY',  1],
        ['USER',           'VIEW_REPORT',    0],
        ['USER',           'APPROVE_SAFETY', 0],
        ['USER',           'MANAGE_USERS',   0],
        ['USER',           'FOURM_TRAINING_MANAGE', 0],
        ['VIEWER',         'VIEW_DASHBOARD', 1],
        ['VIEWER',         'VIEW_REPORT',    1],
        ['VIEWER',         'SUBMIT_SAFETY',  0],
        ['VIEWER',         'APPROVE_SAFETY', 0],
        ['VIEWER',         'MANAGE_USERS',   0],
        ['VIEWER',         'FOURM_TRAINING_MANAGE', 0],
        ['EXECUTIVE',      'VIEW_DASHBOARD', 1],
        ['EXECUTIVE',      'VIEW_REPORT',    1],
        ['EXECUTIVE',      'APPROVE_SAFETY', 1],
        ['EXECUTIVE',      'MANAGE_USERS',   0],
        ['EXECUTIVE',      'SUBMIT_SAFETY',  0],
        ['EXECUTIVE',      'FOURM_TRAINING_MANAGE', 0],
        ['MANAGER',        'VIEW_DASHBOARD', 1],
        ['MANAGER',        'VIEW_REPORT',    1],
        ['MANAGER',        'SUBMIT_SAFETY',  1],
        ['MANAGER',        'APPROVE_SAFETY', 0],
        ['MANAGER',        'MANAGE_USERS',   0],
        ['MANAGER',        'FOURM_TRAINING_MANAGE', 0],
        ['STAFF',          'VIEW_DASHBOARD', 1],
        ['STAFF',          'SUBMIT_SAFETY',  1],
        ['STAFF',          'VIEW_REPORT',    0],
        ['STAFF',          'APPROVE_SAFETY', 0],
        ['STAFF',          'MANAGE_USERS',   0],
        ['STAFF',          'FOURM_TRAINING_MANAGE', 0],
        ['SAFETY_OFFICER', 'VIEW_DASHBOARD', 1],
        ['SAFETY_OFFICER', 'VIEW_REPORT',    1],
        ['SAFETY_OFFICER', 'APPROVE_SAFETY', 1],
        ['SAFETY_OFFICER', 'SUBMIT_SAFETY',  1],
        ['SAFETY_OFFICER', 'MANAGE_USERS',   0],
        ['SAFETY_OFFICER', 'FOURM_TRAINING_MANAGE', 0],
        ['ADMIN',          'FORKLIFT_VIEW', 1],
        ['ADMIN',          'FORKLIFT_REQUEST', 1],
        ['ADMIN',          'FORKLIFT_APPROVE', 1],
        ['ADMIN',          'FORKLIFT_MANAGE', 1],
        ['ADMIN',          'FORKLIFT_RENEW', 1],
        ['ADMIN',          'FORKLIFT_SUSPEND', 1],
        ['ADMIN',          'FORKLIFT_PRINT', 1],
        ['ADMIN',          'FORKLIFT_EXPORT', 1],
        ['ADMIN',          'FORKLIFT_DOCUMENT_MANAGE', 1],
        ['ADMIN',          'FORKLIFT_TEMPLATE_MANAGE', 1],
        ['ADMIN',          'FORKLIFT_SETTINGS_MANAGE', 1],
        ['ADMIN',          'FORKLIFT_AUDIT_VIEW', 1],
        ['USER',           'FORKLIFT_VIEW', 1],
        ['USER',           'FORKLIFT_REQUEST', 1],
        ['MANAGER',        'FORKLIFT_VIEW', 1],
        ['MANAGER',        'FORKLIFT_REQUEST', 1],
        ['MANAGER',        'FORKLIFT_PRINT', 1],
        ['MANAGER',        'FORKLIFT_EXPORT', 1],
        ['SAFETY_OFFICER', 'FORKLIFT_VIEW', 1],
        ['SAFETY_OFFICER', 'FORKLIFT_REQUEST', 1],
        ['SAFETY_OFFICER', 'FORKLIFT_APPROVE', 1],
        ['SAFETY_OFFICER', 'FORKLIFT_MANAGE', 1],
        ['SAFETY_OFFICER', 'FORKLIFT_RENEW', 1],
        ['SAFETY_OFFICER', 'FORKLIFT_SUSPEND', 1],
        ['SAFETY_OFFICER', 'FORKLIFT_PRINT', 1],
        ['SAFETY_OFFICER', 'FORKLIFT_EXPORT', 1],
        ['SAFETY_OFFICER', 'FORKLIFT_DOCUMENT_MANAGE', 1],
    ];
    for (const [role, perm, granted] of defaults) {
        await db.query(
            'INSERT IGNORE INTO Admin_RolePermissions (role, permission, granted) VALUES (?,?,?)',
            [role, perm, granted]
        );
    }

    _permTablesReady = true;
}

// ─── GET /admin/permissions/matrix ───────────────────────────────────────────
router.get('/permissions/matrix', async (_req, res) => {
    try {
        const [rows] = await db.query('SELECT role, permission, granted FROM Admin_RolePermissions');
        // Shape: { ADMIN: { VIEW_DASHBOARD: 1, ... }, ... }
        const matrix = {};
        ALL_ROLES.forEach(r => {
            matrix[r] = {};
            ALL_PERMISSIONS.forEach(p => { matrix[r][p] = 0; });
        });
        rows.forEach(row => {
            if (matrix[row.role]) matrix[row.role][row.permission] = row.granted;
        });
        res.json({ success: true, data: { matrix, roles: ALL_ROLES, permissions: ALL_PERMISSIONS, roleLabels: ROLE_LABELS } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── PUT /admin/permissions/matrix — bulk update ──────────────────────────────
router.put('/permissions/matrix', async (req, res) => {
    try {
        await ensurePermTables();
        const { role, permission, granted } = req.body;
        if (!ALL_ROLES.includes(role) || !ALL_PERMISSIONS.includes(permission))
            return res.status(400).json({ success: false, message: 'role หรือ permission ไม่ถูกต้อง' });
        await db.query(
            'INSERT INTO Admin_RolePermissions (role, permission, granted) VALUES (?,?,?) ON DUPLICATE KEY UPDATE granted=VALUES(granted)',
            [role, permission, granted ? 1 : 0]
        );
        await auditLog(req, 'UPDATE_PERMISSION', 'RolePermission', `${role}:${permission}`,
            `granted: ${granted ? 1 : 0}`);
        res.json({ success: true, message: 'อัปเดต permission สำเร็จ' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
