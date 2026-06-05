const net = require('net');
const tls = require('tls');

function smtpConfigured() {
    return Boolean(process.env.SMTP_HOST);
}

function smtpFrom() {
    return process.env.SMTP_FROM || process.env.SMTP_USER || process.env.ADMIN_EMAIL || 'noreply@localhost';
}

function encodeHeader(value) {
    const text = String(value || '');
    return /^[\x00-\x7F]*$/.test(text)
        ? text
        : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function normalizeRecipients(value) {
    return String(value || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

function stripAddress(value) {
    return String(value || '').replace(/[<>\r\n]/g, '').trim();
}

function base64Lines(value) {
    return Buffer.from(String(value || '').replace(/\r?\n/g, '\r\n'), 'utf8')
        .toString('base64')
        .replace(/.{1,76}/g, '$&\r\n')
        .trim();
}

function buildTextPart(text) {
    return [
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        base64Lines(text),
    ].join('\r\n');
}

function buildHtmlPart(html) {
    return [
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        base64Lines(html),
    ].join('\r\n');
}

function buildMessage({ from, to, subject, text, html }) {
    const recipients = normalizeRecipients(to).join(', ');
    const safeFrom = stripAddress(from);
    const date = new Date().toUTCString();
    const messageId = `${Date.now()}.${Math.random().toString(16).slice(2)}@tsh-safety-core`;
    const hasHtml = String(html || '').trim();
    const boundary = `tsh-safety-core-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const body = hasHtml
        ? [
            `--${boundary}`,
            buildTextPart(text),
            `--${boundary}`,
            buildHtmlPart(html),
            `--${boundary}--`,
        ].join('\r\n')
        : buildTextPart(text);

    return [
        `From: ${safeFrom}`,
        `To: ${recipients}`,
        `Subject: ${encodeHeader(subject)}`,
        `Date: ${date}`,
        `Message-ID: <${messageId}>`,
        'MIME-Version: 1.0',
        hasHtml
            ? `Content-Type: multipart/alternative; boundary="${boundary}"`
            : null,
        '',
        body,
    ].filter(line => line !== null).join('\r\n');
}

function createSocket({ host, port, secure, timeout }) {
    return new Promise((resolve, reject) => {
        const socket = secure
            ? tls.connect({ host, port, servername: host, rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false' })
            : net.connect({ host, port });

        socket.setTimeout(timeout);
        socket.once('connect', () => {
            if (!secure) resolve(socket);
        });
        socket.once('secureConnect', () => resolve(socket));
        socket.once('timeout', () => reject(new Error('SMTP connection timeout')));
        socket.once('error', reject);
    });
}

function createSmtpClient(socket) {
    let buffer = '';
    const waiters = [];

    socket.setEncoding('utf8');
    socket.on('data', chunk => {
        buffer += chunk;
        drain();
    });
    socket.on('error', err => {
        while (waiters.length) waiters.shift().reject(err);
    });

    function drain() {
        const lines = buffer.split(/\r?\n/);
        if (!buffer.endsWith('\n')) {
            buffer = lines.pop() || '';
        } else {
            buffer = '';
        }

        for (const line of lines) {
            if (!line) continue;
            const waiter = waiters[0];
            if (!waiter) continue;
            waiter.lines.push(line);
            if (/^\d{3} /.test(line)) {
                waiters.shift();
                const code = Number(line.slice(0, 3));
                if (waiter.expected.some(prefix => String(code).startsWith(String(prefix)))) {
                    waiter.resolve({ code, lines: waiter.lines });
                } else {
                    waiter.reject(new Error(`SMTP ${code}: ${waiter.lines.join(' | ')}`));
                }
            }
        }
    }

    function expect(expected) {
        return new Promise((resolve, reject) => {
            waiters.push({ expected: Array.isArray(expected) ? expected : [expected], resolve, reject, lines: [] });
            drain();
        });
    }

    function send(line, expected = 250) {
        socket.write(`${line}\r\n`);
        return expect(expected);
    }

    return { expect, send };
}

async function maybeUpgradeStartTls(socket, client, host) {
    if (process.env.SMTP_STARTTLS !== 'true') return { socket, client };
    await client.send('STARTTLS', 220);
    const secureSocket = tls.connect({
        socket,
        servername: host,
        rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
    });
    await new Promise((resolve, reject) => {
        secureSocket.once('secureConnect', resolve);
        secureSocket.once('error', reject);
    });
    return { socket: secureSocket, client: createSmtpClient(secureSocket) };
}

async function sendMail({ to, subject, text, html }) {
    if (!smtpConfigured()) {
        return { skipped: true, reason: 'SMTP_HOST is not configured' };
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || (process.env.SMTP_SECURE === 'true' ? 465 : 587));
    const secure = process.env.SMTP_SECURE === 'true';
    const timeout = Number(process.env.SMTP_TIMEOUT_MS || 15000);
    const from = smtpFrom();
    const recipients = normalizeRecipients(to);
    if (!recipients.length) return { skipped: true, reason: 'No recipient' };

    let socket = await createSocket({ host, port, secure, timeout });
    let client = createSmtpClient(socket);

    try {
        await client.expect(220);
        await client.send(`EHLO ${process.env.SMTP_EHLO_DOMAIN || 'localhost'}`, 250);

        const beforeStartTls = socket;
        const upgraded = await maybeUpgradeStartTls(socket, client, host);
        socket = upgraded.socket;
        client = upgraded.client;
        if (upgraded.socket !== beforeStartTls) {
            await client.send(`EHLO ${process.env.SMTP_EHLO_DOMAIN || 'localhost'}`, 250);
        }

        if (process.env.SMTP_USER) {
            await client.send('AUTH LOGIN', 334);
            await client.send(Buffer.from(process.env.SMTP_USER, 'utf8').toString('base64'), 334);
            await client.send(Buffer.from(process.env.SMTP_PASS || '', 'utf8').toString('base64'), 235);
        }

        await client.send(`MAIL FROM:<${stripAddress(from)}>`, 250);
        for (const rcpt of recipients) {
            await client.send(`RCPT TO:<${stripAddress(rcpt)}>`, [250, 251]);
        }
        await client.send('DATA', 354);
        socket.write(`${buildMessage({ from, to: recipients.join(','), subject, text, html })}\r\n.\r\n`);
        await client.expect(250);
        await client.send('QUIT', 221).catch(() => {});
        socket.end();
        return { sent: true };
    } catch (error) {
        socket.destroy();
        throw error;
    }
}

module.exports = {
    sendMail,
    smtpConfigured,
};
