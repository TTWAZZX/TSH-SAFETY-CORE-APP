'use strict';

if (process.env.CONTROLLED_MAIL_UAT !== '1') {
    console.error('Controlled mail UAT opt-in is required.');
    process.exit(2);
}

require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true });
const crypto = require('crypto');
const { sendMail, smtpConfigured } = require('../utils/email');
const { buildVerificationEmail } = require('../services/company-email-change');

function enabled(name) {
    return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

async function run() {
    const recipient = String(process.env.SMTP_USER || '').trim();
    const ready = enabled('EMAIL_ENABLED')
        && enabled('COMPANY_EMAIL_VERIFICATION_DELIVERY_ENABLED')
        && smtpConfigured()
        && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient);
    if (!ready) throw new Error('Node controlled mail configuration is not ready.');

    const token = crypto.randomBytes(32).toString('base64url');
    const mail = buildVerificationEmail({
        employeeName: 'Controlled Mail UAT',
        email: recipient,
        token,
    });
    const result = await sendMail({
        to: recipient,
        subject: `[UAT] ${mail.subject}`,
        text: mail.text,
        html: mail.html,
    });
    if (!result?.sent) throw new Error('Node SMTP did not accept the message.');
    console.log(JSON.stringify({ runtime: 'Node', accepted: true, template: 'company-email' }));
}

run().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
});
