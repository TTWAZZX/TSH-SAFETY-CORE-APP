'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const originalEnabled = process.env.EMAIL_ENABLED;
const originalHost = process.env.SMTP_HOST;
process.env.EMAIL_ENABLED = 'false';
process.env.SMTP_HOST = 'smtp.invalid';

const { emailEnabled, smtpConfigured, sendMail } = require('../utils/email');

(async () => {
    try {
        assert.strictEqual(emailEnabled(), false);
        assert.strictEqual(smtpConfigured(), false);
        const skipped = await sendMail({ to: 'uat@example.invalid', subject: 'UAT', text: 'UAT' });
        assert.deepStrictEqual(skipped, { skipped: true, reason: 'Email delivery is disabled' });

        const runner = path.resolve(__dirname, '..', '..', 'api', 'tests', 'email_delivery_switch_runner.php');
        const php = spawnSync(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', [runner], { encoding: 'utf8' });
        if (php.status !== 0) throw new Error(php.stderr || php.stdout || 'PHP email switch runner failed');
        const phpResult = JSON.parse(php.stdout);
        assert.strictEqual(phpResult.configured, false);
        assert.deepStrictEqual(phpResult.result, { skipped: true, reason: 'Email delivery is disabled' });

        process.env.EMAIL_ENABLED = 'true';
        assert.strictEqual(emailEnabled(), true);
        assert.strictEqual(smtpConfigured(), true);
        console.log('Email delivery switch: 4 Node/PHP checks passed; disabled mode opened no network connection.');
    } finally {
        if (originalEnabled === undefined) delete process.env.EMAIL_ENABLED;
        else process.env.EMAIL_ENABLED = originalEnabled;
        if (originalHost === undefined) delete process.env.SMTP_HOST;
        else process.env.SMTP_HOST = originalHost;
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});

