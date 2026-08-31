'use strict';

const crypto = require('crypto');

const TEMPLATE_STATUSES = Object.freeze(['Draft', 'Active', 'Archived']);
const CARD_STATUSES = Object.freeze(['Active', 'Revoked', 'Replaced']);
const CARD_WIDTH_MM = 85.60;
const CARD_HEIGHT_MM = 53.98;

function clean(value, max = 255) { return String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max); }
function normalizeTemplateStatus(value) { return TEMPLATE_STATUSES.find(item => item.toLowerCase() === clean(value).toLowerCase()) || null; }
function normalizeCardStatus(value) { return CARD_STATUSES.find(item => item.toLowerCase() === clean(value).toLowerCase()) || null; }
function createRawToken() { return crypto.randomBytes(32).toString('base64url'); }
function hashToken(value) { return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex'); }
function tokenFingerprint(value) { return hashToken(value).slice(0, 12); }
function validRawToken(value) { return /^[A-Za-z0-9_-]{43}$/.test(String(value || '')); }
function normalizeInternalRoute(value) {
    const route = clean(value, 120);
    return /^#bbs-smart-card(?:$|[/?])/.test(route) ? route : '#bbs-smart-card';
}
function cardPayload(employee, template, rawToken, appUrl) {
    const base = String(appUrl || '').replace(/#.*$/, '').replace(/\/+$/, '');
    return {
        employeeId: String(employee.EmployeeID),
        employeeName: String(employee.EmployeeName || ''),
        department: String(employee.Department || ''),
        unit: String(employee.Unit || ''),
        position: String(employee.Position || ''),
        bbsLevel: String(employee.BBSLevel || ''),
        photoUrl: String(employee.PhotoUrl || ''),
        templateId: Number(template.id),
        templateName: String(template.TemplateName || ''),
        widthMM: Number(template.WidthMM || CARD_WIDTH_MM),
        heightMM: Number(template.HeightMM || CARD_HEIGHT_MM),
        includeEmployeeId: Number(template.IncludeEmployeeID) === 1,
        qrUrl: `${base}#bbs-qr=${rawToken}`,
    };
}

module.exports = { TEMPLATE_STATUSES, CARD_STATUSES, CARD_WIDTH_MM, CARD_HEIGHT_MM, clean, normalizeTemplateStatus, normalizeCardStatus, createRawToken, hashToken, tokenFingerprint, validRawToken, normalizeInternalRoute, cardPayload };
