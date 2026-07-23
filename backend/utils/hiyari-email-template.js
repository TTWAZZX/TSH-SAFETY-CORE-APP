const TONE = {
    pending: { color: '#9a3412', bg: '#ffedd5', border: '#fdba74', label: 'ต้องดำเนินการ' },
    approved: { color: '#166534', bg: '#dcfce7', border: '#86efac', label: 'อนุมัติแล้ว' },
    rejected: { color: '#9f1239', bg: '#ffe4e6', border: '#fda4af', label: 'ต้องแก้ไข' },
    completed: { color: '#166534', bg: '#dcfce7', border: '#86efac', label: 'เสร็จสิ้น' },
    neutral: { color: '#1e293b', bg: '#e2e8f0', border: '#cbd5e1', label: 'แจ้งเตือน' },
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeLines(value) {
    if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
    return String(value || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean);
}

function detailRows(details = []) {
    return details
        .filter(item => item && item.label)
        .map(item => ({
            label: String(item.label || ''),
            value: item.value === undefined || item.value === null || item.value === '' ? '-' : String(item.value),
            highlight: Boolean(item.highlight),
        }));
}

const DEFAULT_APP_URL = process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core/';

function buildPlainText({ title, greeting, intro, details, actions, note, footerNote, appUrl, moduleLabel }) {
    const loginUrl = String(appUrl || DEFAULT_APP_URL).trim();
    const lines = [
        title,
        '',
        greeting,
        '',
        ...normalizeLines(intro),
        '',
        'สรุปรายงาน',
        ...detailRows(details).map(item => `${item.label}: ${item.value}`),
    ];

    const actionLines = normalizeLines(actions);
    if (actionLines.length) {
        lines.push('', 'สิ่งที่ต้องดำเนินการ');
        actionLines.forEach((line, index) => lines.push(`${index + 1}. ${line}`));
    }

    const noteLines = normalizeLines(note);
    if (noteLines.length) {
        lines.push('', 'หมายเหตุ', ...noteLines);
    }

    if (loginUrl) {
        lines.push(
            '',
            'เข้าสู่ระบบ / Open Safety Core',
            loginUrl
        );
    }

    lines.push(
        '',
        'ขอบคุณครับ/ค่ะ',
        '',
        '------------------------------------------------------------',
        'TSH Safety Core Activity System',
        moduleLabel || 'Hiyari-Hatto / Near-Miss Reporting Module',
        footerNote || 'อีเมลฉบับนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบ กรุณาอย่าตอบกลับอีเมลนี้'
    );

    return lines.filter((line, index, arr) => !(line === '' && arr[index - 1] === '')).join('\n');
}

function paragraphHtml(lines) {
    return normalizeLines(lines)
        .map(line => `<p style="margin:0 0 10px 0;color:#334155;font-size:14px;line-height:1.65;">${escapeHtml(line)}</p>`)
        .join('');
}

function buildHiyariEmail({ title, kicker, tone = 'neutral', greeting, intro, details, actions, note, footerNote, appUrl, moduleLabel }) {
    const style = TONE[tone] || TONE.neutral;
    const rows = detailRows(details);
    const actionLines = normalizeLines(actions);
    const noteLines = normalizeLines(note);
    const loginUrl = String(appUrl || DEFAULT_APP_URL).trim();
    const text = buildPlainText({ title, greeting, intro, details: rows, actions: actionLines, note: noteLines, footerNote, appUrl: loginUrl, moduleLabel });

    const rowsHtml = rows.map(item => `
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;width:38%;">${escapeHtml(item.label)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:${item.highlight ? style.color : '#0f172a'};font-size:14px;font-weight:${item.highlight ? '800' : '600'};">${escapeHtml(item.value)}</td>
        </tr>`).join('');

    const actionsHtml = actionLines.length ? `
        <div style="margin-top:18px;padding:16px;border:1px solid ${style.border};border-radius:12px;background:${style.bg};">
            <div style="font-size:12px;font-weight:800;color:${style.color};letter-spacing:.04em;margin-bottom:10px;">สิ่งที่ต้องดำเนินการ</div>
            <ol style="margin:0;padding-left:20px;color:#334155;font-size:14px;line-height:1.7;">
                ${actionLines.map(line => `<li style="margin:0 0 6px 0;">${escapeHtml(line)}</li>`).join('')}
            </ol>
        </div>` : '';

    const noteHtml = noteLines.length ? `
        <div style="margin-top:18px;padding:14px;border-left:4px solid ${style.color};background:#f8fafc;border-radius:10px;">
            <div style="font-size:12px;font-weight:800;color:#475569;letter-spacing:.04em;margin-bottom:8px;">หมายเหตุ</div>
            ${paragraphHtml(noteLines)}
        </div>` : '';

    const ctaHtml = loginUrl ? `
        <div style="margin-top:22px;text-align:center;">
            <a href="${escapeHtml(loginUrl)}" target="_blank" rel="noopener" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;line-height:1.2;padding:13px 22px;border-radius:999px;border:1px solid #0f766e;">เข้าสู่ระบบ / Open Safety Core</a>
            <div style="margin-top:10px;color:#64748b;font-size:12px;line-height:1.5;">หากปุ่มเปิดไม่ได้ ให้คัดลอกลิงก์นี้ / If the button does not open, copy this link:<br><a href="${escapeHtml(loginUrl)}" target="_blank" rel="noopener" style="color:#0f766e;text-decoration:underline;">${escapeHtml(loginUrl)}</a></div>
        </div>` : '';

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,'Helvetica Neue',Tahoma,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent;">${escapeHtml(title)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 0;">
    <tr>
      <td align="center" style="padding:0 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 18px 45px rgba(15,23,42,.08);">
          <tr>
            <td bgcolor="#f8fafc" style="padding:0;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
              <div style="padding:28px 28px 24px 28px;border-top:5px solid ${style.color};">
                <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#e2e8f0;color:#334155;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;">${escapeHtml(kicker || 'TSH Safety Core Activity')}</div>
                <h1 style="margin:16px 0 0 0;color:#0f172a;font-size:26px;line-height:1.25;font-weight:800;">${escapeHtml(title)}</h1>
                <div style="margin-top:14px;display:inline-block;padding:7px 12px;border-radius:999px;background:${style.bg};color:${style.color};font-size:12px;font-weight:800;border:1px solid ${style.border};">${escapeHtml(style.label)}</div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 28px 8px 28px;">
              <p style="margin:0 0 14px 0;color:#0f172a;font-size:15px;font-weight:800;">${escapeHtml(greeting || 'Dear user,')}</p>
              ${paragraphHtml(intro)}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0 28px;">
              <div style="font-size:12px;font-weight:800;color:#64748b;letter-spacing:.04em;margin-bottom:10px;">สรุปรายงาน</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;">
                ${rowsHtml || '<tr><td style="padding:14px;color:#64748b;font-size:14px;">No details available</td></tr>'}
              </table>
              ${actionsHtml}
              ${ctaHtml}
              ${noteHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 28px 28px;">
              <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">ขอบคุณครับ/ค่ะ</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background:#0f172a;">
              <div style="color:#e2e8f0;font-size:13px;font-weight:800;">TSH Safety Core Activity System</div>
              <div style="color:#94a3b8;font-size:12px;margin-top:4px;">${escapeHtml(moduleLabel || 'Hiyari-Hatto / Near-Miss Reporting Module')}</div>
              <div style="color:#94a3b8;font-size:11px;margin-top:10px;line-height:1.5;">${escapeHtml(footerNote || 'อีเมลฉบับนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบ กรุณาอย่าตอบกลับอีเมลนี้')}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { text, html };
}

module.exports = {
    buildHiyariEmail,
};
