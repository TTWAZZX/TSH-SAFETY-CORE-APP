function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
}

function normalizeLoginUrl(loginUrl) {
    const trimmed = String(loginUrl || '').trim().replace(/\/+$/, '');
    try {
        const url = new URL(trimmed);
        const host = url.hostname.toLowerCase();
        const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
        return ['http:', 'https:'].includes(url.protocol) && !localHosts.has(host) ? url.href.replace(/\/+$/, '') : '';
    } catch (_) {
        return '';
    }
}

function registrationEmailTemplate({ status, employeeName, employeeId, referenceCode, reason, loginUrl }) {
    const approved = status === 'Approved';
    const resolvedLoginUrl = normalizeLoginUrl(loginUrl);
    const color = approved ? '#059669' : '#dc2626';
    const soft = approved ? '#ecfdf5' : '#fef2f2';
    const title = approved ? 'คำขอสมัครบัญชีได้รับการอนุมัติ' : 'ผลการตรวจสอบคำขอสมัครบัญชี';
    const badge = approved ? 'APPROVED' : 'REJECTED';
    const action = approved
        ? 'บัญชีของคุณพร้อมใช้งานแล้ว กรุณาเข้าสู่ระบบด้วยรหัสพนักงานและรหัสผ่านที่ตั้งไว้'
        : 'กรุณาตรวจสอบเหตุผลด้านล่าง หากต้องการแก้ไขข้อมูลหรือต้องการความช่วยเหลือ กรุณาติดต่อ Safety/Admin';
    const reasonBlock = !approved && reason
        ? `<div style="margin:20px 0;padding:14px 16px;border-radius:10px;background:#fff;border:1px solid #fecaca">
             <div style="font-size:12px;font-weight:700;color:#991b1b;margin-bottom:5px">เหตุผล</div>
             <div style="font-size:14px;color:#7f1d1d;line-height:1.6">${escapeHtml(reason)}</div>
           </div>`
        : '';
    const button = approved && resolvedLoginUrl
        ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 0"><tr><td bgcolor="${color}" style="border-radius:10px">
             <a href="${escapeHtml(resolvedLoginUrl)}" target="_blank" rel="noopener" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;line-height:1.2;padding:13px 24px;border-radius:10px;border:1px solid ${color}">เข้าสู่ระบบ</a>
           </td></tr></table>
           <div style="margin-top:10px;color:#64748b;font-size:12px;line-height:1.5">หากปุ่มเปิดไม่ได้ ให้คัดลอกลิงก์นี้:<br><a href="${escapeHtml(resolvedLoginUrl)}" target="_blank" rel="noopener" style="color:#047857;text-decoration:underline">${escapeHtml(resolvedLoginUrl)}</a></div>`
        : '';
    const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,'Noto Sans Thai',sans-serif;color:#1e293b">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:28px 12px"><tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08)">
          <tr><td style="padding:24px 28px;background:linear-gradient(135deg,#064e3b,#0d9488);color:#fff">
            <div style="font-size:12px;letter-spacing:.08em;opacity:.85">THAI SUMMIT HARNESS CO., LTD.</div>
            <div style="font-size:21px;font-weight:800;margin-top:6px">TSH Safety Core</div>
          </td></tr>
          <tr><td style="padding:30px 28px">
            <span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${soft};color:${color};font-size:11px;font-weight:800;letter-spacing:.08em">${badge}</span>
            <h1 style="font-size:22px;line-height:1.35;margin:16px 0 8px;color:#0f172a">${title}</h1>
            <p style="font-size:14px;line-height:1.7;color:#475569;margin:0 0 20px">เรียน ${escapeHtml(employeeName || employeeId)},<br>${action}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">
              <tr><td style="padding:12px 16px;font-size:12px;color:#64748b">รหัสพนักงาน</td><td style="padding:12px 16px;text-align:right;font-size:13px;font-weight:700">${escapeHtml(employeeId)}</td></tr>
              <tr><td style="padding:12px 16px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0">เลขอ้างอิง</td><td style="padding:12px 16px;text-align:right;font-size:13px;font-weight:700;border-top:1px solid #e2e8f0">${escapeHtml(referenceCode)}</td></tr>
            </table>
            ${reasonBlock}
            ${button}
            <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:26px 0 0">อีเมลนี้ส่งโดยระบบอัตโนมัติ กรุณาอย่าตอบกลับอีเมลนี้</p>
          </td></tr>
        </table>
      </td></tr></table>
    </body></html>`;
    const text = approved
        ? `คำขอ ${referenceCode} ได้รับการอนุมัติแล้ว\nรหัสพนักงาน: ${employeeId}\nเข้าสู่ระบบ: ${resolvedLoginUrl || '-'}`
        : `คำขอ ${referenceCode} ไม่ได้รับการอนุมัติ\nรหัสพนักงาน: ${employeeId}\nเหตุผล: ${reason || '-'}\nกรุณาติดต่อ Safety/Admin`;
    return { subject: `TSH Safety Core | ${title}`, text, html };
}

module.exports = { registrationEmailTemplate };
