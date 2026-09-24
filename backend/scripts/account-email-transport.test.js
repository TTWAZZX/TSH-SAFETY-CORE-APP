'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

process.env.EMAIL_ENABLED = 'true';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '0';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_STARTTLS = 'false';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.SMTP_FROM = 'uat@example.invalid';
process.env.SMTP_FROM_NAME = 'TSH Safety Core UAT';
process.env.SMTP_TIMEOUT_MS = '3000';
process.env.PUBLIC_APP_URL = 'http://localhost:5500';

const { sendMail } = require('../utils/email');
const { buildVerificationEmail } = require('../services/company-email-change');
const { buildResetEmail } = require('../services/password-reset');

const messages = [];
let failNextMessage = true;

function createFakeSmtpServer() {
    return net.createServer(socket => {
        socket.setEncoding('utf8');
        socket.write('220 local-uat ESMTP\r\n');
        let buffer = '';
        let dataMode = false;
        let data = '';

        socket.on('data', chunk => {
            buffer += chunk;
            while (true) {
                const lineEnd = buffer.indexOf('\n');
                if (lineEnd < 0) break;
                const line = buffer.slice(0, lineEnd + 1).replace(/\r?\n$/, '');
                buffer = buffer.slice(lineEnd + 1);
                if (dataMode) {
                    if (line === '.') {
                        dataMode = false;
                        if (failNextMessage) {
                            failNextMessage = false;
                            socket.write('451 simulated temporary failure\r\n');
                        } else {
                            messages.push(data);
                            socket.write('250 queued locally\r\n');
                        }
                        data = '';
                    } else {
                        data += `${line}\r\n`;
                    }
                    continue;
                }
                if (/^EHLO /i.test(line)) socket.write('250-localhost\r\n250 PIPELINING\r\n');
                else if (/^(MAIL FROM|RCPT TO):/i.test(line)) socket.write('250 ok\r\n');
                else if (line === 'DATA') {
                    dataMode = true;
                    socket.write('354 end with dot\r\n');
                } else if (line === 'QUIT') {
                    socket.write('221 bye\r\n');
                    socket.end();
                } else socket.write('250 ok\r\n');
            }
        });
    });
}

function runPhp(port) {
    return new Promise((resolve, reject) => {
        const runner = path.join(__dirname, 'account-email-template-php-runner.php');
        const child = spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', [runner, String(port)], {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', code => {
            if (code !== 0) return reject(new Error(stderr || stdout || `PHP exited ${code}`));
            try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
        });
    });
}

function decodedMimeParts(message) {
    return [...message.matchAll(/Content-Type: text\/(plain|html); charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/g)]
        .map(match => ({ type: match[1], value: Buffer.from(match[2].replace(/\s/g, ''), 'base64').toString('utf8') }));
}

async function run() {
    const nodeCompanySource = fs.readFileSync(path.join(__dirname, '../services/company-email-change.js'), 'utf8');
    const phpCompanySource = fs.readFileSync(path.join(__dirname, '../../api/lib/company_email_change.php'), 'utf8');
    const phpMailerSource = fs.readFileSync(path.join(__dirname, '../../api/mailer.php'), 'utf8');
    assert.match(nodeCompanySource, /sendMail\(\{ to: email, \.\.\.mail \}\)/);
    assert.doesNotMatch(nodeCompanySource, /check\.email/);
    assert.match(phpCompanySource, /mailer_send_mail\(\$email,/);
    assert.match(phpMailerSource, /Status IN \('Queued','Failed'\)/);
    assert.match(phpMailerSource, /mailer_validate_identifier/);

    const server = createFakeSmtpServer();
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    process.env.SMTP_PORT = String(port);
    const token = Buffer.alloc(32, 17).toString('base64url');

    await assert.rejects(
        sendMail({ to: 'retry@example.invalid', subject: 'retry probe', text: 'first attempt' }),
        /SMTP 451/
    );
    const retry = await sendMail({ to: 'retry@example.invalid', subject: 'retry probe', text: 'second attempt' });
    assert.equal(retry.sent, true);

    const company = buildVerificationEmail({ employeeName: '<Company User>', email: 'company@example.invalid', token });
    const reset = buildResetEmail({ employeeName: '<Reset User>', email: 'reset@example.invalid', token });
    assert.match(company.html, /&lt;Company User&gt;/);
    assert.match(reset.html, /&lt;Reset User&gt;/);
    assert.match(company.text, /#verify-company-email=/);
    assert.match(reset.text, /#reset-password=/);
    await sendMail({ to: 'company@example.invalid', ...company });
    await sendMail({ to: 'reset@example.invalid', ...reset });

    const php = await runPhp(port);
    assert.deepEqual(php, {
        companySent: true,
        resetSent: true,
        companyEscaped: true,
        resetEscaped: true,
        companyHasFallbackLink: true,
        resetHasFallbackLink: true,
    });

    await new Promise(resolve => server.close(resolve));
    assert.equal(messages.length, 5);
    for (const message of messages.slice(1)) {
        assert.match(message, /Content-Type: multipart\/alternative/);
        const parts = decodedMimeParts(message);
        assert.deepEqual(parts.map(part => part.type), ['plain', 'html']);
        assert.ok(parts.every(part => part.value.length > 40));
    }
    assert.match(messages[1], /To: company@example\.invalid/);
    assert.match(messages[2], /To: reset@example\.invalid/);
    assert.match(messages[3], /To: account-php@example\.invalid/);
    assert.match(messages[4], /To: account-php@example\.invalid/);
    console.log('Account email transport passed: Node/PHP HTML+text MIME, escaping, recipient routing, temporary failure and retry; all SMTP stayed on 127.0.0.1.');
}

run().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
