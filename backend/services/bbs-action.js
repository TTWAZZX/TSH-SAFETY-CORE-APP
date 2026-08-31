'use strict';

const crypto = require('crypto');

const ACTION_STATUSES = Object.freeze(['Open', 'In Progress', 'Pending Verification', 'Closed', 'Reopened']);
const ACTION_PRIORITIES = Object.freeze(['Critical', 'High', 'Medium', 'Low']);
const TRANSITIONS = Object.freeze({
    Open: Object.freeze(['In Progress']),
    Reopened: Object.freeze(['In Progress']),
    'In Progress': Object.freeze(['Pending Verification']),
    'Pending Verification': Object.freeze(['Closed', 'Reopened']),
    Closed: Object.freeze(['Reopened']),
});

function clean(value, max = 4000) { return String(value ?? '').trim().slice(0, max); }
function positiveInt(value) { return Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null; }
function normalizePriority(value) { const found = ACTION_PRIORITIES.find(item => item.toLowerCase() === clean(value, 20).toLowerCase()); return found || null; }
function normalizeStatus(value) { const found = ACTION_STATUSES.find(item => item.toLowerCase() === clean(value, 30).toLowerCase()); return found || null; }
function normalizeIsoDate(value) { const text = clean(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null; const date = new Date(`${text}T00:00:00Z`); return Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== text ? null : text; }
function sqlDate(value) { return value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10); }
function transitionAllowed(from, to) { return Boolean(TRANSITIONS[from]?.includes(to)); }
function needsOwnerPermission(from, to) { return ['Open','Reopened','In Progress'].includes(from) && ['In Progress','Pending Verification'].includes(to); }
function needsVerifierPermission(from, to) { return ['Pending Verification','Closed'].includes(from) && ['Closed','Reopened'].includes(to); }
function suppressionKey(actionId, eventType, recipientEmployeeId, discriminator = '') { const raw=clean(discriminator,100);const normalized=/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)?new Date(`${raw} 00:00:00 UTC`).toISOString().slice(0,10):raw;return crypto.createHash('sha256').update([actionId,eventType,recipientEmployeeId,normalized].join('|')).digest('hex'); }
function actionNo(answerId) { return `BBS-ACT-${String(answerId).padStart(10, '0')}`; }

async function queueNotification(queryable, { actionId, eventType, recipientEmployeeId, subject, body, discriminator = '' }) {
    const [[employee]] = await queryable.query('SELECT EmployeeID,EmployeeName,CompanyEmail FROM Employees WHERE EmployeeID=? LIMIT 1', [recipientEmployeeId]);
    const email = clean(employee?.CompanyEmail, 255);
    if (!email) return { queued:false, reason:'missing_email' };
    const key = suppressionKey(actionId, eventType, recipientEmployeeId, discriminator);
    const html = `<p>${clean(body, 8000).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</p>`;
    const [result] = await queryable.query(`INSERT IGNORE INTO BBS_Action_EmailOutbox(ActionID,EventType,RecipientEmployeeID,Recipients,Subject,Body,HtmlBody,Status,SuppressionKey) VALUES(?,?,?,?,?,?,?,'Queued',?)`, [actionId,eventType,recipientEmployeeId,email,clean(subject,255),clean(body,8000),html,key]);
    return { queued:Boolean(result.affectedRows), reason:result.affectedRows ? null : 'suppressed' };
}

async function createActionsForObservation(queryable, observation, answers, actorId) {
    const [[rule]] = await queryable.query("SELECT SLADays FROM BBS_Action_SLA_Rules WHERE Priority='Medium' AND IsActive=1 LIMIT 1");
    const slaDays = Math.max(1, Math.min(365, Number(rule?.SLADays || 7)));
    const created = [];
    for (const answer of answers.filter(row => row.Response === 'Unsafe' && Number(row.UnsafeRequiresActionSnapshot) === 1)) {
        const description = [
            `${clean(answer.ItemCodeSnapshot,50)} - ${clean(answer.ItemPromptSnapshot,500)}`,
            clean(answer.Remark) ? `Remark: ${clean(answer.Remark)}` : '',
            clean(answer.ImmediateAction) ? `Immediate action: ${clean(answer.ImmediateAction)}` : '',
        ].filter(Boolean).join('\n');
        const [result] = await queryable.query(`INSERT IGNORE INTO BBS_Corrective_Actions(ActionNo,ObservationID,AnswerID,OwnerEmployeeID,VerifierEmployeeID,Priority,DueDate,Description,Status,CreatedBy) VALUES(?,?,?,?,?,'Medium',DATE_ADD(?,INTERVAL ? DAY),?,'Open',?)`, [actionNo(answer.id),observation.id,answer.id,observation.ObservedEmployeeID,observation.ObserverEmployeeID,observation.ObservationDate,slaDays,description,actorId]);
        const [[action]] = await queryable.query('SELECT * FROM BBS_Corrective_Actions WHERE AnswerID=? LIMIT 1', [answer.id]);
        if (result.affectedRows && action) {
            await queryable.query("INSERT INTO BBS_Action_History(ActionID,FromStatus,ToStatus,ActorEmployeeID,Note,EventType) VALUES(?,NULL,'Open',?,'Created automatically from submitted Unsafe answer.','Created')", [action.id,actorId]);
            await queueNotification(queryable, { actionId:action.id,eventType:'Assigned',recipientEmployeeId:action.OwnerEmployeeID,subject:`BBS corrective action assigned: ${action.ActionNo}`,body:`A corrective action was assigned to you and is due on ${sqlDate(action.DueDate)}.`,discriminator:String(action.RowVersion) });
            created.push(action);
        }
    }
    return created;
}

module.exports = { ACTION_STATUSES, ACTION_PRIORITIES, TRANSITIONS, clean, positiveInt, normalizePriority, normalizeStatus, normalizeIsoDate, sqlDate, transitionAllowed, needsOwnerPermission, needsVerifierPermission, suppressionKey, actionNo, queueNotification, createActionsForObservation };
