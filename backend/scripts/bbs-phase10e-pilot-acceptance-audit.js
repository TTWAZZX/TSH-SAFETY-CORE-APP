'use strict';

const path = require('path');
const mysql = require('mysql2/promise');
const { bangkokIsoDate } = require('../services/bbs-phase1');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const count = value => Number(value || 0);
const normalizeCounts = row => Object.fromEntries(
    Object.entries(row || {}).map(([key, value]) => [key, count(value)])
);

(async () => {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT || 3306),
    });

    try {
        const asOf = bangkokIsoDate();
        const [[scope]] = await db.query(
            `SELECT d.id DepartmentID,d.Name DepartmentName,u.id SafetyUnitID,u.name SafetyUnitName,
                    p.id PilotID,p.IsActive,p.EffectiveFrom,p.EffectiveTo
               FROM Master_Departments d
               JOIN Master_SafetyUnits u ON u.department_id=d.id
               LEFT JOIN BBS_Pilot_Scopes p ON p.DepartmentID=d.id AND p.SafetyUnitID=u.id
              WHERE LOWER(TRIM(d.Name))='maintenance sec.'
                AND LOWER(TRIM(u.name))='tube cutting'
              LIMIT 1`
        );
        if (!scope) throw new Error('Approved Pilot Master scope MAINTENANCE SEC. / Tube Cutting is unavailable.');

        const settingKeys = [
            'staged_admin_only','pilot_scope_only','inspector_team_management_enabled','inspector_schedule_enabled',
            'batch_observation_enabled','mobile_observation_wizard_enabled','draft_autosave_enabled',
            'analytics_enabled','analytics_export_enabled','department_cards_enabled',
            'community_reporting_enabled','action_notifications_enabled',
        ];
        const [settingRows] = await db.query(
            `SELECT SettingKey,SettingValue FROM BBS_Settings
              WHERE SettingKey IN (
                'staged_admin_only','pilot_scope_only','inspector_team_management_enabled','inspector_schedule_enabled',
                'batch_observation_enabled','mobile_observation_wizard_enabled','draft_autosave_enabled',
                'analytics_enabled','analytics_export_enabled','department_cards_enabled',
                'community_reporting_enabled','action_notifications_enabled'
              ) ORDER BY SettingKey`
        );
        const returnedSettings = Object.fromEntries(settingRows.map(row => [row.SettingKey, String(row.SettingValue)]));
        const settings = Object.fromEntries(settingKeys.map(key => [key, returnedSettings[key] ?? null]));

        const [[people]] = await db.query(
            `SELECT COUNT(*) Employees,
                    SUM(m.id IS NOT NULL) MappedEmployees,
                    SUM(m.BBSLevel='Group Leader') GroupLeaders,
                    SUM(m.BBSLevel='Operator') Operators
               FROM Employees e
               LEFT JOIN Master_Positions pos ON LOWER(TRIM(pos.Name))=LOWER(TRIM(e.Position))
               LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=pos.id AND m.IsActive=1
              WHERE LOWER(TRIM(e.Department))=LOWER(TRIM(?))
                AND LOWER(TRIM(e.Unit))=LOWER(TRIM(?))`,
            [scope.DepartmentName, scope.SafetyUnitName]
        );

        const [[configuration]] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM BBS_Inspector_Enrollments x
                  WHERE x.DepartmentID=? AND x.SafetyUnitID=? AND x.Status='Active' AND x.IsActive=1
                    AND x.EffectiveFrom<=? AND COALESCE(x.EffectiveTo,'9999-12-31')>=?) ActiveEnrollments,
                (SELECT COUNT(*) FROM BBS_Hierarchy_Assignments x
                  WHERE x.DepartmentID=? AND x.SafetyUnitID=? AND x.IsActive=1
                    AND x.EffectiveFrom<=? AND COALESCE(x.EffectiveTo,'9999-12-31')>=?) ActiveAssignments,
                (SELECT COUNT(*) FROM BBS_Inspector_Schedule_Rules r
                  JOIN BBS_Inspector_Enrollments x ON x.id=r.EnrollmentID
                 WHERE x.DepartmentID=? AND x.SafetyUnitID=? AND x.Status='Active' AND x.IsActive=1
                   AND r.Status='Active' AND r.EffectiveFrom<=? AND COALESCE(r.EffectiveTo,'9999-12-31')>=?) ActiveScheduleRules,
                (SELECT COUNT(DISTINCT v.id) FROM BBS_Checklist_Versions v
                  JOIN BBS_Checklist_Templates t ON t.id=v.TemplateID AND t.IsActive=1
                  JOIN BBS_Checklist_Scope_Mappings s ON s.VersionID=v.id AND s.IsActive=1
                 WHERE v.Status='Published' AND v.EffectiveFrom<=? AND COALESCE(v.EffectiveTo,'9999-12-31')>=?
                   AND (s.DepartmentID IS NULL OR s.DepartmentID=?)
                   AND (s.SafetyUnitID IS NULL OR s.SafetyUnitID=?)) ApplicablePublishedChecklists,
                (SELECT COUNT(*) FROM BBS_Card_Templates WHERE DepartmentID=? AND Status='Active') ActivePersonalTemplates,
                (SELECT COUNT(*) FROM BBS_Department_Card_Templates WHERE DepartmentID=? AND Status='Active') ActiveDepartmentTemplates,
                (SELECT COUNT(*) FROM BBS_Department_QR_Cards WHERE DepartmentID=? AND Status='Active') ActiveDepartmentQrCards,
                (SELECT COUNT(*) FROM BBS_Community_Action_Handlers WHERE DepartmentID=? AND IsActive=1) ActiveCommunityHandlers`,
            [
                scope.DepartmentID, scope.SafetyUnitID, asOf, asOf,
                scope.DepartmentID, scope.SafetyUnitID, asOf, asOf,
                scope.DepartmentID, scope.SafetyUnitID, asOf, asOf,
                asOf, asOf, scope.DepartmentID, scope.SafetyUnitID,
                scope.DepartmentID, scope.DepartmentID, scope.DepartmentID, scope.DepartmentID,
            ]
        );

        const [[workflow]] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM BBS_Observations o
                  WHERE o.ObservedDepartmentID=? AND o.ObservedSafetyUnitID=? AND o.Status='Draft') DraftObservations,
                (SELECT COUNT(*) FROM BBS_Observations o
                  WHERE o.ObservedDepartmentID=? AND o.ObservedSafetyUnitID=? AND o.Status='Submitted') SubmittedObservations,
                (SELECT COUNT(*) FROM BBS_Observation_Batches b
                  JOIN BBS_Observation_Batch_Members bm ON bm.BatchID=b.id
                  JOIN BBS_Observations o ON o.id=bm.ObservationID
                 WHERE o.ObservedDepartmentID=? AND o.ObservedSafetyUnitID=? AND b.Status='Submitted') SubmittedBatchMembers,
                (SELECT COUNT(*) FROM BBS_Cards c
                  JOIN Employees e ON e.EmployeeID=c.EmployeeID
                 WHERE LOWER(TRIM(e.Department))=LOWER(TRIM(?))) PersonalCards,
                (SELECT COUNT(*) FROM BBS_Card_Print_Logs p
                  JOIN BBS_Cards c ON c.id=p.CardID
                  JOIN Employees e ON e.EmployeeID=c.EmployeeID
                 WHERE LOWER(TRIM(e.Department))=LOWER(TRIM(?))) PersonalPrints,
                (SELECT COUNT(*) FROM BBS_Department_Card_Print_Logs p
                  JOIN BBS_Department_QR_Cards q ON q.id=p.DepartmentQRID
                 WHERE q.DepartmentID=?) DepartmentPrints,
                (SELECT COUNT(*) FROM BBS_Community_Reports r WHERE r.DepartmentID=? AND r.ReportType='Good') GoodCommunityReports,
                (SELECT COUNT(*) FROM BBS_Community_Reports r WHERE r.DepartmentID=? AND r.ReportType='Risky') RiskyCommunityReports`,
            [
                scope.DepartmentID, scope.SafetyUnitID,
                scope.DepartmentID, scope.SafetyUnitID,
                scope.DepartmentID, scope.SafetyUnitID,
                scope.DepartmentName, scope.DepartmentName, scope.DepartmentID, scope.DepartmentID, scope.DepartmentID,
            ]
        );

        const [[integrity]] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM BBS_Observation_Files f LEFT JOIN BBS_Observations o ON o.id=f.ObservationID WHERE o.id IS NULL) OrphanObservationFiles,
                (SELECT COUNT(*) FROM BBS_Action_Files f LEFT JOIN BBS_Corrective_Actions a ON a.id=f.ActionID WHERE a.id IS NULL) OrphanActionFiles,
                (SELECT COUNT(*) FROM BBS_Corrective_Actions a LEFT JOIN BBS_Observations o ON o.id=a.ObservationID LEFT JOIN BBS_Observation_Answers x ON x.id=a.AnswerID WHERE o.id IS NULL OR x.id IS NULL) OrphanActions,
                (SELECT COUNT(*) FROM BBS_Observations o
                  JOIN BBS_Observation_Answers a ON a.ObservationID=o.id
                  LEFT JOIN BBS_Corrective_Actions ca ON ca.ObservationID=o.id AND ca.AnswerID=a.id
                 WHERE o.ObservedDepartmentID=? AND o.ObservedSafetyUnitID=? AND o.Status='Submitted'
                   AND a.Response='Unsafe' AND a.UnsafeRequiresActionSnapshot=1 AND ca.id IS NULL) UnsafeMissingAction,
                (SELECT COUNT(*) FROM BBS_Action_EmailOutbox WHERE Status='Queued') QueuedEmails,
                (SELECT COUNT(*) FROM BBS_Action_EmailOutbox WHERE Status='Failed') FailedEmails`,
            [scope.DepartmentID, scope.SafetyUnitID]
        );

        const platformBlockers = [];
        const rolloutMode = settings.staged_admin_only === '1'
            ? 'ADMIN_ONLY'
            : settings.pilot_scope_only === '1'
                ? 'CONTROLLED_PILOT'
                : 'COMPANY_WIDE';
        if (settings.staged_admin_only === null) platformBlockers.push('STAGED_ADMIN_ONLY_SETTING_MISSING');
        if (settings.pilot_scope_only === null) platformBlockers.push('PILOT_SCOPE_ONLY_SETTING_MISSING');
        if (rolloutMode === 'COMPANY_WIDE') platformBlockers.push('COMPANY_WIDE_ROLLOUT_NOT_AUTHORIZED');
        for (const key of [
            'inspector_team_management_enabled','inspector_schedule_enabled','batch_observation_enabled',
            'mobile_observation_wizard_enabled','draft_autosave_enabled','analytics_enabled',
            'analytics_export_enabled','department_cards_enabled','community_reporting_enabled',
        ]) if (settings[key] !== '1') platformBlockers.push(`FEATURE_DISABLED:${key}`);
        if (count(integrity.OrphanObservationFiles) || count(integrity.OrphanActionFiles) || count(integrity.OrphanActions)) platformBlockers.push('DATA_INTEGRITY_FAILURE');
        if (count(integrity.UnsafeMissingAction)) platformBlockers.push('UNSAFE_ACTION_RECONCILIATION_FAILURE');

        const configurationBlockers = [];
        if (count(scope.IsActive) !== 1) configurationBlockers.push('PILOT_SCOPE_INACTIVE');
        if (count(people.GroupLeaders) < 1) configurationBlockers.push('NO_GROUP_LEADER');
        if (count(people.Operators) < 1) configurationBlockers.push('NO_OPERATOR');
        if (count(people.MappedEmployees) !== count(people.Employees)) configurationBlockers.push('UNMAPPED_PILOT_EMPLOYEE');
        if (count(configuration.ActiveEnrollments) < 1) configurationBlockers.push('NO_ACTIVE_INSPECTOR_ENROLLMENT');
        if (count(configuration.ActiveAssignments) < 1) configurationBlockers.push('NO_ACTIVE_ASSIGNMENT');
        if (count(configuration.ActiveAssignments) < 2) configurationBlockers.push('BATCH_PILOT_REQUIRES_TWO_ACTIVE_ASSIGNMENTS');
        if (count(configuration.ActiveScheduleRules) < 1) configurationBlockers.push('NO_ACTIVE_INSPECTOR_SCHEDULE');
        if (count(configuration.ApplicablePublishedChecklists) < 1) configurationBlockers.push('NO_APPLICABLE_PUBLISHED_CHECKLIST');
        if (count(configuration.ActivePersonalTemplates) < 1) configurationBlockers.push('NO_ACTIVE_PERSONAL_CARD_TEMPLATE');
        if (count(configuration.ActiveDepartmentTemplates) < 1) configurationBlockers.push('NO_ACTIVE_DEPARTMENT_CARD_TEMPLATE');
        if (count(configuration.ActiveDepartmentQrCards) < 1) configurationBlockers.push('NO_ACTIVE_DEPARTMENT_QR');
        if (count(configuration.ActiveCommunityHandlers) < 1) configurationBlockers.push('NO_ACTIVE_COMMUNITY_HANDLER');

        const acceptanceEvidenceMissing = [];
        if (count(workflow.SubmittedObservations) < 1) acceptanceEvidenceMissing.push('NO_SUBMITTED_SINGLE_OBSERVATION');
        if (count(workflow.SubmittedBatchMembers) < 2) acceptanceEvidenceMissing.push('NO_SUBMITTED_BATCH_OBSERVATION');
        if (count(workflow.PersonalCards) < 1 || count(workflow.PersonalPrints) < 1) acceptanceEvidenceMissing.push('NO_PERSONAL_CARD_ISSUE_PRINT_ACCEPTANCE');
        if (count(workflow.DepartmentPrints) < 1) acceptanceEvidenceMissing.push('NO_DEPARTMENT_CARD_PRINT_ACCEPTANCE');
        if (count(workflow.GoodCommunityReports) < 1) acceptanceEvidenceMissing.push('NO_COMMUNITY_GOOD_ACCEPTANCE');
        if (count(workflow.RiskyCommunityReports) < 1) acceptanceEvidenceMissing.push('NO_COMMUNITY_RISK_ACTION_ACCEPTANCE');

        const warnings = [];
        if (count(workflow.DraftObservations)) warnings.push('DRAFT_OBSERVATIONS_REQUIRE_OWNER_REVIEW');
        if (settings.action_notifications_enabled !== '1') warnings.push('ACTION_EMAIL_DELIVERY_DISABLED');
        if (count(integrity.QueuedEmails)) warnings.push('ACTION_EMAIL_QUEUE_REQUIRES_REVIEW');
        if (count(integrity.FailedEmails)) warnings.push('ACTION_EMAIL_FAILURES_REQUIRE_RETRY_OR_ACCEPTED_EXCEPTION');

        let decision = 'READY_FOR_ROLLOUT_REVIEW';
        if (platformBlockers.length) decision = 'PLATFORM_BLOCKED';
        else if (configurationBlockers.length) decision = 'CONFIGURATION_REQUIRED';
        else if (acceptanceEvidenceMissing.length) decision = 'PILOT_EXECUTION_REQUIRED';

        console.log(JSON.stringify({
            phase: '10E',
            readOnly: true,
            asOf,
            rolloutChanged: false,
            approvedScope: {
                departmentId: count(scope.DepartmentID),
                department: scope.DepartmentName,
                safetyUnitId: count(scope.SafetyUnitID),
                safetyUnit: scope.SafetyUnitName,
                active: count(scope.IsActive) === 1,
            },
            settings,
            rolloutMode,
            pilotPeople: normalizeCounts(people),
            configuration: normalizeCounts(configuration),
            workflowEvidence: normalizeCounts(workflow),
            integrity: normalizeCounts(integrity),
            platformBlockers,
            configurationBlockers,
            acceptanceEvidenceMissing,
            warnings,
            decision,
            nextAction: decision === 'READY_FOR_ROLLOUT_REVIEW'
                ? 'Obtain explicit business-owner rollout approval; then follow the Production backup/deploy/smoke/rollback runbook.'
                : rolloutMode === 'CONTROLLED_PILOT'
                    ? 'Complete the listed Pilot requirements and representative multi-role UAT inside controlled Pilot access, then rerun this audit.'
                    : 'Keep staged_admin_only=1, complete configuration, then use controlled Pilot access for representative multi-role UAT and rerun this audit.',
        }, null, 2));
        console.log(`BBS Phase 10E Pilot acceptance gate: ${decision} (read-only; rollout unchanged)`);
    } finally {
        await db.end();
    }
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
