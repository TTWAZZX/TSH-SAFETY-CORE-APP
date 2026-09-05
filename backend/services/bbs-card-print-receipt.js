'use strict';

const crypto = require('crypto');
const PURPOSE = 'bbs-card-print-v1';
const MAX_RECEIPT_BYTES = 524288;

class PrintReceiptError extends Error {
    constructor(message, code = 'BBS_PRINT_RECEIPT_INVALID', status = 400) {
        super(message); this.code = code; this.status = status;
    }
}

function signature(payload) {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured.');
    return crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${PURPOSE}.${payload}`).digest('hex');
}

// A two-part, purpose-bound receipt is not an authentication JWT. It contains
// only the already redacted snapshot, never a raw Personal/Department QR.
function createPrintReceipt({ kind, subjectId, actorId, snapshot }, now = Math.floor(Date.now() / 1000)) {
    const payload = Buffer.from(JSON.stringify({ purpose: PURPOSE, kind, subjectId: Number(subjectId),
        actorId: String(actorId), expiresAt: now + 86400, snapshotJson: JSON.stringify(snapshot) })).toString('base64url');
    if (payload.length > MAX_RECEIPT_BYTES) throw new PrintReceiptError('The card layout is too large to prepare for printing.');
    return `${payload}.${signature(payload)}`;
}

function readPrintReceipt(receipt, expected, now = Math.floor(Date.now() / 1000)) {
    if (typeof receipt !== 'string' || receipt.length > MAX_RECEIPT_BYTES + 65) throw new PrintReceiptError('Invalid print receipt.');
    const parts = receipt.split('.');
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1]) ||
        !crypto.timingSafeEqual(Buffer.from(parts[1], 'hex'), Buffer.from(signature(parts[0]), 'hex'))) {
        throw new PrintReceiptError('The prepared card was modified. Prepare it again.');
    }
    let payload, snapshot;
    try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); snapshot = JSON.parse(payload.snapshotJson); }
    catch { throw new PrintReceiptError('Invalid print receipt content.'); }
    if (payload.purpose !== PURPOSE || payload.kind !== expected.kind || payload.subjectId !== Number(expected.subjectId) ||
        payload.actorId !== String(expected.actorId)) throw new PrintReceiptError('This prepared card belongs to another request or user.', 'BBS_PRINT_RECEIPT_SCOPE', 403);
    if (!Number.isInteger(payload.expiresAt) || payload.expiresAt < now) throw new PrintReceiptError('The prepared card expired. Prepare it again.', 'BBS_PRINT_RECEIPT_EXPIRED', 409);
    const qr = snapshot?.values?.[expected.kind === 'Personal' ? 'card.personal_qr' : 'department.community_qr'];
    if (qr?.kind !== `${expected.kind}Qr` || qr.fingerprint !== String(expected.fingerprint) || !Number.isInteger(snapshot?.layout?.layoutVersionId)) {
        throw new PrintReceiptError('The prepared card no longer matches its QR.', 'BBS_PRINT_RECEIPT_QR_CHANGED', 409);
    }
    return { layoutVersionId: snapshot.layout.layoutVersionId, snapshot,
        snapshotJson: payload.snapshotJson, renderContractHash: crypto.createHash('sha256').update(payload.snapshotJson).digest('hex') };
}

module.exports = { PrintReceiptError, createPrintReceipt, readPrintReceipt };
