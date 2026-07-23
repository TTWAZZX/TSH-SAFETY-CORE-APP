'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const GOLDEN_CASES = [
  {
    id: 'ppe-hot-work',
    category: 'ppe',
    question: 'งานเชื่อมตัดประกายไฟต้องใส่ PPE อะไรบ้าง ตอบแบบหน้างานสั้นๆ',
    expectedSignals: ['PPE', 'แว่น', 'ถุงมือ', 'หน้ากาก'],
    risk: 'medium',
  },
  {
    id: 'ky-before-lift',
    category: 'ky',
    question: 'ช่วยทำ KY ก่อนยกของด้วยเครน มีอันตรายและมาตรการอะไรบ้าง',
    expectedSignals: ['KY', 'อันตราย', 'มาตรการ', 'ผู้รับผิดชอบ'],
    risk: 'high',
  },
  {
    id: 'near-miss-trip',
    category: 'near_miss',
    question: 'เดินสะดุดสายไฟแต่ไม่ล้ม ต้องบันทึก Near Miss ไหม และควรแก้อะไรทันที',
    expectedSignals: ['Near Miss', 'บันทึก', 'แก้ไข', 'ทันที'],
    risk: 'medium',
  },
  {
    id: 'patrol-unsafe-condition',
    category: 'patrol',
    question: 'Safety Patrol เจอสภาพไม่ปลอดภัยต้องทำอะไรเป็นลำดับแรก',
    expectedSignals: ['หยุด', 'ควบคุม', 'แจ้ง', 'ติดตาม'],
    risk: 'high',
  },
  {
    id: 'chemical-spill',
    category: 'chemical',
    question: 'ถ้าเจอสารเคมีรั่วไหลที่พื้น ต้องทำอะไรทันที',
    expectedSignals: ['กั้นพื้นที่', 'SDS', 'PPE', 'แจ้ง'],
    risk: 'high',
  },
  {
    id: 'no-confirmed-company-policy',
    category: 'policy_guardrail',
    question: 'บริษัทอนุญาตให้ถอด guard เครื่องจักรตอนเครื่องทำงานได้ไหม',
    expectedSignals: ['ไม่ได้', 'หยุด', 'ยืนยัน', 'ความปลอดภัย'],
    risk: 'critical',
  },
  {
    id: 'forklift-pedestrian',
    category: 'traffic',
    question: 'รถโฟล์คลิฟท์กับคนเดินใช้ทางร่วมกัน ต้องควบคุมความเสี่ยงยังไง',
    expectedSignals: ['แยกทาง', 'ความเร็ว', 'สัญญาณ', 'ระยะห่าง'],
    risk: 'high',
  },
  {
    id: 'working-at-height',
    category: 'height',
    question: 'ทำงานบนที่สูงควรเช็กอะไรบ้างก่อนเริ่มงาน',
    expectedSignals: ['เข็มขัด', 'จุดยึด', 'นั่งร้าน', 'ตรวจ'],
    risk: 'high',
  },
  {
    id: 'electric-panel',
    category: 'electrical',
    question: 'เห็นตู้ไฟเปิดฝาค้างและมีสายไฟโผล่ ควรตอบสนองอย่างไร',
    expectedSignals: ['กั้นพื้นที่', 'ช่างไฟ', 'ห้ามสัมผัส', 'แจ้ง'],
    risk: 'high',
  },
  {
    id: 'system-status-summary',
    category: 'system_status',
    question: 'ช่วยสรุปสถานะงานความปลอดภัยที่ค้างในระบบแบบสั้นๆ',
    expectedSignals: ['ระบบ', 'สถานะ', 'ค้าง', 'สรุป'],
    risk: 'low',
  },
  {
    id: 'image-analysis-expectation',
    category: 'image',
    question: 'ถ้าผมส่งรูปหน้างานมา Johnny ควรวิเคราะห์อะไรให้บ้าง',
    expectedSignals: ['อันตราย', 'ความเสี่ยง', 'มาตรการ', 'ข้อจำกัด'],
    risk: 'medium',
  },
  {
    id: 'unknown-data-honesty',
    category: 'guardrail',
    question: 'ถ้าไม่มีข้อมูลยืนยันในเอกสารบริษัท Johnny ควรตอบยังไง',
    expectedSignals: ['ไม่พบ', 'ยืนยัน', 'บอกตรง', 'ข้อมูล'],
    risk: 'low',
  },
];

function readEnv() {
  const envPath = path.join(ROOT, 'backend', '.env');
  const values = {};
  if (!fs.existsSync(envPath)) return values;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
    if (match) values[match[1].trim()] = match[2].trim();
  });
  return values;
}

function assert(checks, name, ok, meta = {}) {
  checks.push({ name, ok: Boolean(ok), ...meta });
  if (!ok) process.exitCode = 1;
}

function validateStatic() {
  const checks = [];
  const nodeRoute = read('backend/routes/johnny-ai.js');
  const phpRoute = read('api/handlers/johnny_ai.php');
  const frontend = read('public/js/pages/johnny-ai.js');
  const pkg = read('backend/package.json');

  const categories = new Set(GOLDEN_CASES.map((item) => item.category));
  assert(checks, 'golden case count', GOLDEN_CASES.length >= 10, { count: GOLDEN_CASES.length });
  assert(checks, 'golden categories cover field use', ['ppe', 'ky', 'near_miss', 'patrol', 'chemical', 'policy_guardrail'].every((key) => categories.has(key)));
  assert(checks, 'golden cases have expected signals', GOLDEN_CASES.every((item) => item.id && item.question && Array.isArray(item.expectedSignals) && item.expectedSignals.length >= 3));
  assert(checks, 'Node prompt has answer shape guardrails', nodeRoute.includes('Choose the answer shape from the question') && nodeRoute.includes('For yes/no policy questions'));
  assert(checks, 'PHP prompt has answer shape guardrails', phpRoute.includes('Choose the answer shape from the question') && phpRoute.includes('For yes/no policy questions'));
  assert(checks, 'Node answer quality returned', nodeRoute.includes('answerQuality') && nodeRoute.includes('companyDataGuarded'));
  assert(checks, 'PHP answer quality returned', phpRoute.includes('answerQuality') && phpRoute.includes('companyDataGuarded'));
  assert(checks, 'Frontend source and workflow signals present', frontend.includes('sourceBadge') && frontend.includes('workflowActionButtons') && frontend.includes('johnny-copy-answer'));
  assert(checks, 'Package golden script registered', pkg.includes('smoke:johnny-golden-quality'));

  return checks;
}

async function liveApi(baseUrl, token, pathName, options = {}) {
  const response = await fetch(`${baseUrl}/api${pathName}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function runLive() {
  const env = readEnv();
  const baseUrl = (process.env.JOHNNY_GOLDEN_URL || env.PUBLIC_UPLOAD_BASE_URL || '').replace(/\/+$/, '');
  const employeeId = process.env.SMOKE_USER_EMPLOYEE_ID || env.SMOKE_USER_EMPLOYEE_ID;
  const password = process.env.SMOKE_USER_PASSWORD || env.SMOKE_USER_PASSWORD;
  if (!baseUrl || !employeeId || !password) throw new Error('Missing base URL or smoke user credentials for live golden run');

  const login = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ employeeId, password }),
  }).then((res) => res.json());
  if (!login.token) throw new Error('Login did not return token');

  const live = [];
  for (const item of GOLDEN_CASES) {
    let conversationId = null;
    try {
      const { response, payload } = await liveApi(baseUrl, login.token, '/johnny/chat', {
        method: 'POST',
        body: JSON.stringify({ message: item.question }),
      });
      conversationId = payload?.data?.conversationId || null;
      const answer = String(payload?.data?.answer || '');
      const matchedSignals = item.expectedSignals.filter((signal) => answer.toLowerCase().includes(String(signal).toLowerCase()));
      live.push({
        id: item.id,
        ok: response.ok && payload?.success === true && answer.length >= 24 && matchedSignals.length >= 1,
        status: response.status,
        sourceType: payload?.data?.sourceType || '',
        matchedSignals,
        answerLength: answer.length,
        conversationId,
      });
    } finally {
      if (conversationId) {
        await liveApi(baseUrl, login.token, `/johnny/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' }).catch(() => {});
      }
    }
  }
  return live;
}

async function main() {
  const checks = validateStatic();
  const liveRequested = process.argv.includes('--live') || process.env.JOHNNY_GOLDEN_LIVE === '1';
  let live = [];
  if (liveRequested) {
    live = await runLive();
    assert(checks, 'live golden cases passed with cleanup', live.every((item) => item.ok), { liveCount: live.length });
  }
  const passed = checks.filter((item) => item.ok).length;
  console.log(JSON.stringify({
    marker: 'JOHNNY_GOLDEN_QUALITY_V1',
    mode: liveRequested ? 'live-cleanup' : 'static-read-only',
    passed,
    total: checks.length,
    caseCount: GOLDEN_CASES.length,
    categories: Array.from(new Set(GOLDEN_CASES.map((item) => item.category))).sort(),
    checks,
    live,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
