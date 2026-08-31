import { BADGE_LABELS, CENTER_GROUPS, GUIDE_STATUS_LABELS, MODULE_META, MODULE_ORDER, moduleIcon } from './module-meta.js?v=20260825-bbs-phase3-r1';

const GUIDE_EXAMPLES = {
    'bbs-smart-card': 'หัวหน้ากลุ่มเลือกพนักงานใน Unit ที่ได้รับมอบหมาย ตอบ Safe/Unsafe/N/A แนบหลักฐานเมื่อจำเป็น บันทึกร่าง และส่งเพื่อให้นับ KPI ประจำวัน',
    dashboard: 'เปิดระบบตอนเริ่มวันเพื่อดูภาพรวมกิจกรรม ความคืบหน้า และรายการที่ควรติดตามก่อนเข้าแต่ละโมดูล',
    search: 'ต้องการดู Safety 360 ของพนักงานหนึ่งคน ให้ค้นหาด้วยรหัสหรือชื่อ แล้วเลือกปีเพื่อดูเป้าหมายและผลงานจริง',
    policy: 'ต้องการอ่านนโยบายความปลอดภัยฉบับล่าสุดก่อนประชุมหรือก่อนเริ่มงาน ให้เปิดโมดูลนี้เพื่อตรวจเอกสารและไฟล์แนบ',
    committee: 'ต้องการรู้ว่าประเด็นความปลอดภัยควรประสานใคร ให้ดูรายชื่อและบทบาทคณะกรรมการฯ จากโมดูลนี้',
    kpi: 'ก่อนประชุมประจำเดือน Safety ใช้โมดูลนี้ดู KPI ที่ไม่ถึงเป้าและส่งออก PDF สำหรับติดตามผล',
    patrol: 'ออกตรวจพื้นที่แล้วพบจุดเสี่ยง ให้บันทึก issue พร้อมรูป และติดตาม Temporary/After action จนปิดงาน',
    cccf: 'มีงาน CCCF ที่ต้องส่ง Form A ให้เลือก Worker/Permanent กรอกข้อมูล แล้วส่งให้ Safety/Admin ตรวจตาม workflow',
    'machine-safety': 'พบรายการตรวจเครื่องจักรที่ต้องแก้ไข ให้ใช้โมดูลนี้ติดตามสถานะและผู้รับผิดชอบจนจบงาน',
    ojt: 'หัวหน้างานต้องย้ำ Stop-Call-Wait กับทีมก่อนเริ่มงาน ให้บันทึกกิจกรรมหรือข้อมูลอบรมที่เกี่ยวข้อง',
    training: 'ต้องตรวจว่าพนักงานผ่านหลักสูตร Safety หรือยัง ให้ค้นหาชื่อ/หลักสูตรและดู pass rate ในโมดูลนี้',
    accident: 'เกิดอุบัติเหตุในพื้นที่ ให้บันทึกเหตุการณ์ สาเหตุ CAPA และส่งออก PDF เมื่อใช้ทำรายงาน',
    'safety-culture': 'ต้องติดตามพฤติกรรมความปลอดภัยหรือ PPE violation ให้ดู dashboard และบันทึก assessment/inspection',
    contractor: 'ก่อนผู้รับเหมาเข้าพื้นที่ ให้ตรวจข้อมูล เอกสาร และสถานะ E-Pass ในโมดูล Contractor / Supplier',
    hiyari: 'เห็นเหตุเกือบพลาด เช่น สะดุดสายไฟหรือเกือบชนรถเข็น ให้บันทึก Near-Miss พร้อมพื้นที่และความเสี่ยง',
    ky: 'ก่อนเริ่มงานเสี่ยง ให้ทีมทำ KY Activity ระบุอันตราย มาตรการ และส่งให้ Safety/Admin review',
    yokoten: 'มีบทเรียนจากอุบัติเหตุหรือ Near-Miss ที่ควรแชร์ ให้ Admin สร้าง Yokoten ไปยังแผนกเป้าหมาย',
    fourm: 'เมื่อมีการเปลี่ยนเครื่องจักร วิธีการ วัตถุดิบ หรือคนทำงาน ให้สร้าง 4M notice และติดตาม task/training',
    forklift: 'พนักงานต้องใช้รถยก ให้สร้างคำขอ ตรวจหลักฐาน อนุมัติใบอนุญาต พิมพ์บัตร และติดตามวันหมดอายุ',
    'johnny-ai': 'มีคำถามด้านความปลอดภัยหรือรูปหน้างาน ให้ถาม Johnny AI เพื่อค้นข้อมูลและช่วยวิเคราะห์เบื้องต้น',
    admin: 'Admin ต้องกำหนด TargetYear, สิทธิ์, Employee Master, Branding หรือดู Audit ให้เปิด System Console'
};

export const LOGIN_MODULE_GUIDES = [
    {
        key: 'dashboard',
        title: 'Dashboard',
        purpose: 'สรุปสถานะกิจกรรมความปลอดภัย ตัวชี้วัด และ compliance ของแต่ละแผนกในหน้าเดียว',
        whenToUse: 'ใช้เป็นจุดเริ่มต้นหลังเข้าสู่ระบบ หรือก่อนประชุมเพื่อตรวจรายการที่ต้องติดตาม',
        audience: ['User', 'Admin', 'หัวหน้างาน', 'Safety'], badges: ['User', 'Report'],
        actions: ['เลือกดูการ์ดสรุปและสถานะรายโมดูล', 'ตรวจ Compliance Matrix และรายการแจ้งเตือน', 'เปิดโมดูลต้นทางเมื่อต้องลงรายละเอียด'],
        reports: ['Dashboard overview และ Compliance Matrix'],
        warnings: ['ค่าบางรายการขึ้นกับ TargetYear และข้อมูลที่บันทึกในโมดูลต้นทาง'], updatedAt: '2026-07-01'
    },
    {
        key: 'search',
        title: 'ค้นหารายบุคคล / Safety 360',
        purpose: 'รวมข้อมูลกิจกรรม เป้าหมาย ความเสี่ยง และประวัติความปลอดภัยของพนักงานรายบุคคล',
        whenToUse: 'ใช้เมื่อต้องติดตามพนักงานรายคนหรือทบทวนผลงานตามปีที่เลือก',
        audience: ['User', 'Admin', 'หัวหน้างาน', 'Safety'], badges: ['User', 'Report'],
        actions: ['ค้นหาด้วยรหัสหรือชื่อพนักงาน', 'เลือกปีที่ต้องการตรวจ', 'อ่าน Activity Targets, compliance, timeline และ risk profile'],
        reports: ['Safety 360 profile และ compliance signals'],
        warnings: ['ผู้ใช้ทั่วไปอาจดูได้เฉพาะข้อมูลของตนเองตามสิทธิ์', 'Target ใช้ลำดับรายบุคคล > แผนก/Unit > ตำแหน่ง'], updatedAt: '2026-07-01'
    },
    {
        key: 'policy',
        title: 'นโยบายความปลอดภัย',
        purpose: 'ศูนย์รวมประกาศ นโยบาย และเอกสารอ้างอิงด้านความปลอดภัยของบริษัท',
        whenToUse: 'ใช้เมื่อต้องอ่านข้อกำหนดล่าสุด หรืออ้างอิงเอกสารก่อนทำงาน/ประชุม',
        audience: ['User', 'หัวหน้างาน', 'Safety'],
        badges: ['User', 'PDF'],
        actions: ['เปิดเมนูนโยบายความปลอดภัย', 'เลือกเอกสารหรือนโยบายที่ต้องการอ่าน', 'เปิดไฟล์แนบเพื่อดูรายละเอียดฉบับล่าสุด'],
        reports: ['เอกสารนโยบายและไฟล์แนบที่อัปโหลดในระบบ'],
        warnings: ['ตรวจวันที่และเวอร์ชันของเอกสารก่อนนำไปใช้อ้างอิง']
    },
    {
        key: 'committee',
        title: 'คณะกรรมการฯ',
        purpose: 'แสดงรายชื่อ บทบาท และข้อมูลคณะกรรมการความปลอดภัย',
        whenToUse: 'ใช้ค้นหาผู้ประสานงานหรือผู้รับผิดชอบด้านความปลอดภัย',
        audience: ['User', 'Admin', 'Safety'],
        badges: ['User', 'Admin'],
        actions: ['เปิดเมนูคณะกรรมการฯ', 'ตรวจรายชื่อ ตำแหน่ง และบทบาท', 'Admin/Safety ปรับปรุงข้อมูลเมื่อมีการเปลี่ยนแปลง'],
        reports: [],
        warnings: ['เป็นข้อมูลอ้างอิงผู้ประสานงาน ไม่ใช่ workflow อนุมัติแทนโมดูลอื่น']
    },
    {
        key: 'kpi',
        title: 'KPI & Metrics',
        purpose: 'ติดตามตัวชี้วัดความปลอดภัย เป้าหมาย และรายการที่ต้องเร่งติดตาม',
        whenToUse: 'ใช้สำหรับประชุม ติดตามผลรายปี และสรุปสถานะ KPI',
        audience: ['Admin', 'หัวหน้างาน', 'Safety'],
        badges: ['Admin', 'Report', 'PDF'],
        actions: ['เลือกปีหรือขอบเขตข้อมูล', 'ตรวจ KPI ที่ผ่าน เฝ้าระวัง หรือไม่ถึงเป้า', 'ส่งออก PDF เมื่อต้องใช้สรุปรายงาน'],
        reports: ['Safety KPI PDF export'],
        warnings: ['ข้อมูล KPI อ้างอิงค่าที่บันทึกในระบบ ควรตรวจความครบถ้วนก่อนสรุป']
    },
    {
        key: 'patrol',
        title: 'Safety Patrol',
        purpose: 'บันทึกการตรวจพื้นที่ การเข้าร่วม patrol และติดตาม issue จนปิดงาน',
        whenToUse: 'ใช้ตอนออกตรวจพื้นที่ พบประเด็นไม่ปลอดภัย หรือดูสถานะการแก้ไข',
        audience: ['User', 'Admin', 'หัวหน้างาน', 'Safety'],
        badges: ['Workflow', 'Report', 'PDF'],
        actions: ['เปิดรอบ Patrol หรือบันทึก Self Patrol', 'ยื่นลา Patrol ในรอบที่เข้าเงื่อนไขและติดตามผลอนุมัติ', 'บันทึก issue พร้อม STOP/Responsible Dept/Unit หลายค่า', 'ติดตาม Temporary/After action จนปิดประเด็น'],
        reports: ['Issue PDF/Excel', 'Top & Management และ Supervisor Attendance PDF/Excel', 'Card image export'],
        warnings: ['Pending/Approved leave ป้องกันการเช็กอินซ้ำ', 'Accepted Coverage รวมรอบจริงและลาที่อนุมัติ', 'ผู้ใช้ทั่วไปแก้ได้เฉพาะ progress ของ issue ที่รับผิดชอบและยังไม่ Closed'], updatedAt: '2026-07-01'
    },
    {
        key: 'cccf',
        title: 'CCCF Activity',
        purpose: 'จัดการ Form A Worker/Permanent พร้อม workflow ตรวจ Excel หรือ signed PDF',
        whenToUse: 'ใช้เมื่อต้องประเมินงาน CCCF ส่งเอกสาร และติดตามการตรวจจน Completed',
        audience: ['User', 'Admin', 'Safety'],
        badges: ['Workflow', 'PDF', 'Admin'],
        actions: ['เลือกแบบ Worker หรือ Permanent', 'Worker แนบรูปหน้างานได้ 1–3 รูป', 'Permanent ใช้เลขรายการรายปีและส่งเอกสารตาม workflow', 'Admin เลือก Manual/Actual และ Unit scope เพื่อติดตามเป้าหมาย'],
        reports: ['CCCF Form A Worker/Permanent PDF export', 'Permanent Excel/PDF upload workflow', 'Card image export'],
        warnings: ['Worker ใช้ Unit Target เดียวกันทั้ง Manual และ Actual', 'Permanent อาจต้องมี CompanyEmail ของผู้รับผิดชอบ', 'Direct signed PDF ใช้ได้เฉพาะ assignment ที่อนุญาต'], updatedAt: '2026-07-01'
    },
    {
        key: 'machine-safety',
        title: 'Machine Safety',
        purpose: 'ติดตาม Machine & Device Safety เช่น audit รายการตรวจ และสถานะแก้ไข',
        whenToUse: 'ใช้ตรวจความพร้อมของเครื่องจักร/อุปกรณ์ และติดตาม action ที่เกี่ยวข้อง',
        audience: ['Admin', 'หัวหน้างาน', 'Safety'],
        badges: ['Workflow', 'Report'],
        actions: ['เปิดโมดูล Machine Safety', 'เลือกมุมมองหรือตัวกรองที่ต้องการ', 'บันทึกหรือติดตามรายการตรวจตามสิทธิ์'],
        reports: ['ข้อมูลสรุปและตารางติดตามในโมดูล'],
        warnings: ['ควรใช้ข้อมูลตาม master data เพื่อลดปัญหาการกรองแผนกหรือสถานะไม่ตรงกัน']
    },
    {
        key: 'forklift',
        title: 'ใบอนุญาตรถยก',
        purpose: 'จัดการคำขอ ใบอนุญาต เอกสาร การต่ออายุ บัตร QR และการแจ้งเตือนหมดอายุของผู้ขับรถยก',
        whenToUse: 'ใช้เมื่อต้องขอ อนุมัติ ออก ต่ออายุ ระงับ หรือยืนยันใบอนุญาตรถยก',
        audience: ['Admin', 'หัวหน้างาน', 'Safety'], badges: ['Workflow', 'Report', 'Admin'],
        actions: ['สร้างคำขอและเลือกประเภทใบอนุญาต', 'Admin/Safety อนุมัติ ปฏิเสธ หรือยกเลิก', 'จัดการเอกสาร ต่ออายุ และพิมพ์บัตรจาก Template ที่ Publish แล้ว', 'ตรวจ QR verification และ Email Outbox'],
        reports: ['ทะเบียนใบอนุญาต CSV/PDF', 'Expiry reminder queue', 'Audit และ print logs'],
        warnings: ['ระบบป้องกันใบอนุญาตประเภทเดียวกันที่ยัง Active ซ้ำ', 'Published card version ถูกล็อกแก้ไข', 'Reminder ต้องตรวจผู้รับก่อนส่ง'], updatedAt: '2026-07-01'
    },
    {
        key: 'ojt',
        title: 'Stop-Call-Wait',
        purpose: 'บันทึกกิจกรรม SCW/OJT เพื่อหยุด เรียก และรอเมื่อพบความไม่ปลอดภัย',
        whenToUse: 'ใช้เมื่อมีการสอนงานหรือย้ำพฤติกรรมหยุดงานอย่างปลอดภัย',
        audience: ['User', 'หัวหน้างาน', 'Safety'],
        badges: ['User', 'Workflow'],
        actions: ['เปิดเมนู Stop-Call-Wait', 'บันทึกกิจกรรมหรือข้อมูลอบรมที่เกี่ยวข้อง', 'ติดตามความครบถ้วนตามเป้าหมายกิจกรรม'],
        reports: ['Activity Targets compliance widget ในบางมุมมอง'],
        warnings: ['ใช้บันทึกการเรียนรู้และพฤติกรรมความปลอดภัย ไม่แทนการแจ้งอุบัติเหตุจริง']
    },
    {
        key: 'training',
        title: 'Safety Training',
        purpose: 'ดูหลักสูตร อบรม คะแนน และสถานะผ่าน/ไม่ผ่านของพนักงาน',
        whenToUse: 'ใช้ติดตามการอบรมรายบุคคล รายหลักสูตร หรือความครบถ้วนของทีม',
        audience: ['User', 'Admin', 'หัวหน้างาน'],
        badges: ['User', 'Admin', 'Report'],
        actions: ['ค้นหาหลักสูตรหรือพนักงาน', 'บันทึกผลอบรมตามสิทธิ์', 'ตรวจ pass rate และ compliance summary'],
        reports: ['Training records', 'Compliance summary'],
        warnings: ['เกณฑ์สีของ pass rate ใช้ตาม logic ในระบบ ควรตรวจข้อมูลหลักสูตรก่อนสรุปผล']
    },
    {
        key: 'accident',
        title: 'Accident Report',
        purpose: 'รายงานอุบัติเหตุ สอบสวนสาเหตุ ติดตาม CAPA และส่งออกเอกสาร',
        whenToUse: 'ใช้เมื่อเกิดอุบัติเหตุหรือจำเป็นต้องติดตาม corrective/preventive action',
        audience: ['User', 'Admin', 'Safety', 'หัวหน้างาน'],
        badges: ['Workflow', 'PDF', 'Report'],
        actions: ['บันทึกรายละเอียดเหตุการณ์ ผู้เกี่ยวข้อง และความรุนแรง', 'ใส่สาเหตุและ corrective/preventive action', 'ติดตามสถานะและส่งออก PDF เมื่อจำเป็น'],
        reports: ['Accident single-case PDF', 'Accident overview PDF'],
        warnings: ['การลบรายงานเป็น soft delete', 'ไฟล์แนบยังคงอยู่จนกว่าจะลบไฟล์แนบแยกต่างหาก']
    },
    {
        key: 'safety-culture',
        title: 'Safety Culture',
        purpose: 'ติดตามคะแนนวัฒนธรรมความปลอดภัย PPE inspection และ PPE violation',
        whenToUse: 'ใช้ดูภาพรวมพฤติกรรมความปลอดภัย ประเมินพื้นที่ และติดตาม PPE issue',
        audience: ['User', 'Admin', 'Safety'],
        badges: ['Report', 'PDF', 'Workflow'],
        actions: ['เปิด dashboard เพื่อดูคะแนนและแนวโน้ม', 'บันทึก assessment หรือ PPE inspection ตามงานจริง', 'ติดตาม violation/action และส่งออก PDF'],
        reports: ['Safety Culture Dashboard PDF', 'Assessment PDF'],
        warnings: ['PDF จะเพิ่มหน้าตามข้อมูลที่มี เพื่อหลีกเลี่ยงหน้าว่างเมื่อข้อมูลยังน้อย']
    },
    {
        key: 'bbs-smart-card',
        title: 'BBS Smart Card',
        purpose: 'บันทึกการสังเกตพฤติกรรมความปลอดภัยตาม Checklist ที่เหมาะกับพนักงานและขอบเขตงาน',
        whenToUse: 'ใช้โดยหัวหน้าที่ได้รับมอบหมาย เมื่อต้องสังเกต Safe/Unsafe/N/A และเก็บหลักฐานเพื่อการเรียนรู้',
        audience: ['User', 'Admin', 'หัวหน้างาน', 'Safety'],
        badges: ['User', 'QR', 'Print'],
        actions: ['เปิด My Workspace เพื่อตรวจ KPI และทีม', 'สแกน QR แล้ว Login ด้วยบัญชีของตนเองเพื่อกลับเข้า Workspace', 'เลือกพนักงานจากรายชื่อที่ระบบอนุญาตและส่ง Observation', 'Admin อัปโหลด Template ออกบัตร Revoke/Replace และพิมพ์รายคนหรือ Batch'],
        reports: ['Personal KPI numerator/denominator', 'ประวัติ Observation ตามสิทธิ์', 'Card issue/revoke/replace/print audit'],
        warnings: ['QR ไม่ใช่รหัสผ่านและไม่เปลี่ยนตัวตนใน Session', 'พิมพ์บัตรซ้ำต้อง Replace เพื่อยกเลิก QR เดิม', 'Unsafe และหลักฐานยังใช้กติกาและสิทธิ์เดิม'],
        updatedAt: '2026-08-25'
    },
    {
        key: 'contractor',
        title: 'Contractor / Supplier',
        purpose: 'จัดการข้อมูล Contractor/Supplier และ E-Pass ที่เกี่ยวข้องกับความปลอดภัย',
        whenToUse: 'ใช้ตรวจข้อมูลผู้รับเหมา/ผู้ขาย เอกสาร และสถานะก่อนเข้าพื้นที่',
        audience: ['Admin', 'Safety'],
        badges: ['Admin', 'Workflow'],
        actions: ['เปิดโมดูล Contractor / Supplier', 'เพิ่มหรือตรวจข้อมูลผู้รับเหมา/ผู้ขาย', 'ติดตามสถานะเอกสารหรือสิทธิ์ผ่านตาม workflow'],
        reports: ['รายการติดตามในโมดูล'],
        warnings: ['ควรตรวจเอกสารและสถานะให้ครบก่อนอนุญาตเข้าพื้นที่']
    },
    {
        key: 'hiyari',
        title: 'Hiyari-Hatto / Near-Miss',
        purpose: 'บันทึกเหตุการณ์เกือบเกิดอุบัติเหตุ ติดตาม review/close และต่อยอดเป็น Yokoten ได้',
        whenToUse: 'ใช้เมื่อพบเหตุการณ์เกือบพลาด จุดเสี่ยง หรือบทเรียนที่ควรป้องกันซ้ำ',
        audience: ['User', 'Admin', 'Safety'],
        badges: ['User', 'Workflow', 'Report'],
        actions: ['บันทึก near-miss พร้อมพื้นที่ รายละเอียด และระดับความเสี่ยง', 'Safety/Admin ตรวจสอบและปิดงานเมื่อดำเนินการครบ', 'ส่งต่อไป Yokoten เมื่อควรสื่อสารข้ามแผนก'],
        reports: ['Hiyari records', 'Email workflow'],
        warnings: ['การส่งต่อไป Yokoten ใช้ sessionStorage เพื่อพา Admin ไปเปิดฟอร์มหัวข้อ']
    },
    {
        key: 'ky',
        title: 'KY Activity',
        purpose: 'บันทึกกิจกรรม KY/KYT ระบุอันตราย มาตรการ และติดตาม review/close',
        whenToUse: 'ใช้ก่อนเริ่มงานหรือกิจกรรมที่ต้องประเมินอันตรายร่วมกัน',
        audience: ['User', 'Admin', 'Safety Unit'],
        badges: ['User', 'Workflow', 'PDF'],
        actions: ['กรอกทีม วันที่ แผนก Safety Unit และรายละเอียดอันตราย', 'ตรวจ Company Email ที่ดึงจาก Employee Master', 'ส่งให้ Safety/Admin review และ close ตามสถานะ'],
        reports: ['KY Activity PDF summary pack', 'KY email outbox สำหรับ Admin'],
        warnings: ['Company Email ถูกล็อกจาก master จนกว่าผู้ใช้เลือกแก้เอง', 'มี outbox สำหรับ retry email']
    },
    {
        key: 'yokoten',
        title: 'Yokoten',
        purpose: 'สื่อสารบทเรียนหรือประเด็นความเสี่ยงไปยังแผนกเป้าหมาย และติดตาม response',
        whenToUse: 'ใช้เมื่อมีบทเรียนจากเหตุการณ์/near-miss ที่ควรกระจายให้แผนกอื่นรับทราบและตอบกลับ',
        audience: ['Admin', 'หัวหน้างาน', 'Safety'],
        badges: ['Workflow', 'PDF', 'Admin'],
        actions: ['Admin สร้างหัวข้อและกำหนดแผนก/หน่วยงานเป้าหมาย', 'แผนกตอบว่าเกี่ยวข้องหรือไม่ พร้อม action/evidence เมื่อเกี่ยวข้อง', 'Admin อนุมัติหรือส่งกลับแก้ไข response'],
        reports: ['Yokoten PDF export', 'Dashboard/response tracking'],
        warnings: ['ระบบกำหนด one response ต่อแผนกต่อหัวข้อ', 'TargetDepts ว่างหมายถึงทุกแผนก']
    },
    {
        key: 'fourm',
        title: '4M Change',
        purpose: 'จัดการการเปลี่ยนแปลง Man/Machine/Material/Method และ Training Matrix ที่เกี่ยวข้อง',
        whenToUse: 'ใช้เมื่อมีการเปลี่ยนแปลงงาน เครื่องจักร วัตถุดิบ วิธีการ หรือการอบรมที่ต้องควบคุม',
        audience: ['Admin', 'หัวหน้างาน', 'Safety'],
        badges: ['Workflow', 'PDF', 'Report'],
        actions: ['สร้างหรือเปิด 4M notice', 'กำหนด task/ผู้รับผิดชอบ และข้อมูล training matrix เมื่อเกี่ยวข้อง', 'สร้าง Curriculum และมอบหมาย/โอนพนักงานหรือหลักสูตร', 'ติดตาม dashboard, notification และส่งออกเอกสาร'],
        reports: ['Single Notice PDF', 'Training Matrix PDF/Excel', 'Dashboard PDF'],
        warnings: ['ข้อมูล 4M ถูกนำไป enrich ใน Person Search/Employee Safety 360 ด้วย', 'ตรวจสถานะ assignment และปีของ Curriculum ก่อนสรุปรายงาน'], updatedAt: '2026-07-01'
    },
    {
        key: 'johnny-ai',
        title: 'Johnny AI',
        purpose: 'ผู้ช่วยค้นความรู้ด้านความปลอดภัย สนทนา วิเคราะห์ภาพ และอ้างอิงฐานความรู้ขององค์กร',
        whenToUse: 'ใช้เมื่อมีคำถาม ต้องค้นคู่มือ หรืออยากวิเคราะห์ความเสี่ยงจากภาพเบื้องต้น',
        audience: ['User', 'Admin', 'Safety'], badges: ['User', 'Workflow'],
        actions: ['พิมพ์คำถามพร้อมบริบทงาน', 'แนบภาพเมื่อใช้วิเคราะห์หน้างาน', 'ตรวจแหล่งอ้างอิงและใช้ดุลยพินิจ Safety ก่อนนำไปปฏิบัติ', 'Admin จัดการ Knowledge Base และ reindex'],
        reports: ['Conversation history และ Knowledge Base status'],
        warnings: ['คำตอบ AI เป็นข้อมูลสนับสนุน ไม่แทนการอนุมัติหรือการประเมินโดยผู้เชี่ยวชาญ'], updatedAt: '2026-07-01'
    },
    {
        key: 'admin',
        title: 'System Console',
        purpose: 'ศูนย์กลางสำหรับ Employee Master, Safety Core Data, Activity Targets, สิทธิ์, Branding, Health และ Audit',
        whenToUse: 'ใช้โดย Admin เพื่อกำหนดโครงสร้างและค่ากลางที่หลายโมดูลนำไปใช้ร่วมกัน',
        audience: ['Admin', 'Safety'], badges: ['Admin', 'Report'],
        actions: ['ดู Safety Core Data และจัด roster', 'ตั้ง Activity Target ตาม TargetYear ด้วย Position/Scope/Employee priority', 'จัดการพนักงาน องค์กร สิทธิ์ และ Branding', 'ตรวจ Health, Data Quality และ Audit Logs'],
        reports: ['Safety Core Data Excel', 'Target coverage matrix export', 'Audit/health summaries'],
        warnings: ['การแก้ TargetYear ส่งผลต่อ Dashboard, Safety 360, Patrol และ CCCF', 'ตรวจ scope และปีให้ถูกต้องก่อนบันทึก'], updatedAt: '2026-07-01'
    }
];

let lastFocusedElement = null;
let activeCenterFilter = '';
let activeCenterGroup = 'all';
let activeCenterGuideKey = 'policy';

function escHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function guideMeta(guide) {
    return MODULE_META[guide.key] || {};
}

function guideTitle(guide) {
    return guideMeta(guide).shortTitle || guide.title;
}

function guideAudience(guide) {
    return guideMeta(guide).audience || guide.audience || [];
}

function guideBadges(guide) {
    return guideMeta(guide).badges || guide.badges || [];
}

function guidePermissions(guide) {
    const audience = guideAudience(guide);
    const badges = guideBadges(guide);
    const permissions = [];
    if (audience.includes('User')) permissions.push('พนักงานทั่วไปเปิดดูหรือบันทึกข้อมูลของตนเองตามสิทธิ์โมดูล');
    if (audience.includes('หัวหน้างาน') || audience.includes('Safety Unit')) permissions.push('หัวหน้างานหรือ Safety Unit ใช้ติดตามทีม หน่วยงาน และรายการที่รับผิดชอบ');
    if (audience.includes('Safety')) permissions.push('Safety ใช้ตรวจสอบ workflow รายงาน และข้อมูลที่เกี่ยวข้องกับงานความปลอดภัย');
    if (audience.includes('Admin') || badges.includes('Admin')) permissions.push('Admin จัดการข้อมูล ตั้งค่า อนุมัติ หรือดูรายงานระดับระบบตาม permission ที่กำหนด');
    if (audience.includes('System Administration') || badges.includes('System')) permissions.push('System Administration ใช้สำหรับ Employee Master, permission, audit, health, branding และ TargetYear');
    return permissions.length ? permissions : ['สิทธิ์ขึ้นกับ Role และ Permission ที่ Admin กำหนดใน System Console'];
}

function guideSearchText(guide) {
    return [
        guideTitle(guide),
        guideMeta(guide).title,
        guide.purpose,
        guide.whenToUse,
        GUIDE_EXAMPLES[guide.key],
        ...guideAudience(guide),
        ...guideBadges(guide),
        ...guidePermissions(guide),
        ...(guide.actions || []),
        ...(guide.reports || []),
        ...(guide.warnings || [])
    ].join(' ').toLowerCase();
}

function badgeHtml(label) {
    return `<span class="login-guide-badge">${escHtml(BADGE_LABELS[label] || label)}</span>`;
}

function compactCardHtml(guide, index) {
    const previewActions = guide.actions.slice(0, 3).map(action => `<li>${escHtml(action)}</li>`).join('');
    const previewClass = index < 4 ? 'is-preview-down' : 'is-preview-up';
    const edgeClass = index % 2 === 1 ? 'is-right-col' : '';
    const title = guideTitle(guide);
    return `
        <button type="button" class="login-guide-card ${previewClass} ${edgeClass}" data-guide-key="${escHtml(guide.key)}" aria-label="เปิดคู่มือ ${escHtml(title)}">
            <span class="login-guide-icon">${moduleIcon(guide.key)}</span>
            <span class="login-guide-title">${escHtml(title)}</span>
            <span class="login-guide-badges">${guideBadges(guide).slice(0, 2).map(badgeHtml).join('')}</span>
            <span class="login-guide-preview" role="tooltip">
                <strong>${escHtml(title)}</strong>
                <span>${escHtml(guide.purpose)}</span>
                <b>ตัวอย่าง: ${escHtml(GUIDE_EXAMPLES[guide.key] || guide.whenToUse)}</b>
                <em>เหมาะกับ: ${guideAudience(guide).map(escHtml).join(' / ')}</em>
                <ul>${previewActions}</ul>
            </span>
        </button>`;
}

function desktopPanelHtml() {
    return `
        <div class="login-guide-panel">
            <div class="login-guide-head">
                <p class="login-guide-eyebrow">โมดูลในระบบ</p>
                <button type="button" class="login-guide-all-btn" data-guide-all>ดูคู่มือทั้งหมด</button>
            </div>
            <div class="login-guide-list" data-guide-list>
                ${LOGIN_MODULE_GUIDES.map(compactCardHtml).join('')}
            </div>
        </div>`;
}

function mobileHelpHtml() {
    return `
        <button type="button" class="login-guide-mobile-btn" data-guide-all>
            <span>${moduleIcon('policy')}</span>
            <span>ดูคู่มือการใช้งานโมดูล</span>
        </button>`;
}

function detailList(items) {
    if (!items?.length) return '<p class="login-guide-muted">ไม่มีรายงานหรือ PDF เฉพาะในโมดูลนี้</p>';
    return `<ul>${items.map(item => `<li>${escHtml(item)}</li>`).join('')}</ul>`;
}

function guideDetailHtml(guide) {
    const meta = guideMeta(guide);
    const updatedAt = guide.updatedAt || meta.updatedAt || '2026-07-01';
    const status = meta.status || 'active';
    const route = meta.route || guide.key;
    return `
        <div class="login-guide-detail">
            <p class="login-guide-detail-summary">${escHtml(guide.purpose)}</p>
            <div class="login-guide-detail-badges">${guideBadges(guide).map(badgeHtml).join('')}</div>
            <p class="login-guide-muted">สถานะ: ${escHtml(GUIDE_STATUS_LABELS[status] || status)} · อัปเดตล่าสุด ${escHtml(updatedAt)} · Route #${escHtml(route)}</p>
            <a href="#${escHtml(route)}" class="login-guide-open-link" data-guide-open-route="${escHtml(route)}">เปิดโมดูลหลัง Login</a>
            <section><h4>โมดูลนี้สื่อถึงอะไร</h4><p>${escHtml(guide.purpose)}</p></section>
            <section><h4>ควรใช้เมื่อไหร่</h4><p>${escHtml(guide.whenToUse)}</p></section>
            <section class="login-guide-example"><h4>ตัวอย่างสถานการณ์</h4><p>${escHtml(GUIDE_EXAMPLES[guide.key] || guide.whenToUse)}</p></section>
            <section><h4>เหมาะกับใคร</h4><p>${guideAudience(guide).map(escHtml).join(' / ')}</p></section>
            <section><h4>Permission</h4>${detailList(guidePermissions(guide))}</section>
            <section><h4>Quick Start</h4>${detailList(guide.actions)}</section>
            <section><h4>Workflow</h4><p>${escHtml(guide.whenToUse)}</p></section>
            <section><h4>Reports / PDF</h4>${detailList(guide.reports)}</section>
            <section class="login-guide-note"><h4>Cautions</h4>${detailList(guide.warnings)}</section>
            <section><h4>ต้องทำอะไรบ้าง</h4>${detailList(guide.actions)}</section>
            <section><h4>รายงานหรือ PDF ที่เกี่ยวข้อง</h4>${detailList(guide.reports)}</section>
            <section class="login-guide-note"><h4>ข้อควรระวังจาก workflow จริง</h4>${detailList(guide.warnings)}</section>
        </div>`;
}

export function helpCenterCoverage() {
    const guideKeys = new Set(LOGIN_MODULE_GUIDES.map(guide => guide.key));
    const manifestKeys = new Set(MODULE_ORDER);
    return {
        missingGuides: MODULE_ORDER.filter(key => !guideKeys.has(key)),
        orphanGuides: LOGIN_MODULE_GUIDES.map(guide => guide.key).filter(key => !manifestKeys.has(key)),
        duplicateGuides: LOGIN_MODULE_GUIDES.map(guide => guide.key).filter((key, index, rows) => rows.indexOf(key) !== index),
    };
}

function openGuideModal(guide) {
    openLoginGuideDialog(guideTitle(guide), guideDetailHtml(guide));
}

function centerFilteredGuides() {
    const term = activeCenterFilter.trim().toLowerCase();
    const group = CENTER_GROUPS.find(item => item.key === activeCenterGroup) || CENTER_GROUPS[0];
    return LOGIN_MODULE_GUIDES.filter(guide => {
        const matchesGroup = group.match({ ...guide, audience: guideAudience(guide) });
        const matchesTerm = !term || guideSearchText(guide).includes(term);
        return matchesGroup && matchesTerm;
    });
}

function centerListHtml(guides) {
    if (!guides.length) return '<p class="login-guide-center-empty">ไม่พบคู่มือที่ตรงกับคำค้นหา</p>';
    return guides.map(guide => {
        const title = guideTitle(guide);
        return `
        <button type="button" class="login-guide-center-item ${guide.key === activeCenterGuideKey ? 'is-active' : ''}" data-guide-key="${escHtml(guide.key)}">
            <span class="login-guide-center-item-icon">${moduleIcon(guide.key)}</span>
            <span class="login-guide-center-item-copy">
                <strong>${escHtml(title)}</strong>
                <small>${escHtml(guide.purpose)}</small>
            </span>
            <span class="login-guide-center-meta">${guideBadges(guide).slice(0, 2).map(badgeHtml).join('')}</span>
        </button>`;
    }).join('');
}

function centerDetailHtml(guide) {
    if (!guide) {
        return `
            <div class="login-guide-center-placeholder">
                <strong>เลือกโมดูลเพื่อดูคู่มือ</strong>
                <span>ค้นหาหรือเลือกจากรายการด้านซ้ายเพื่ออ่านรายละเอียด</span>
            </div>`;
    }
    const title = guideTitle(guide);
    return `
        <button type="button" class="login-guide-back-btn" data-guide-back>
            ${moduleIcon('yokoten', 'w-4 h-4')}
            <span>กลับไปเลือกรายการ</span>
        </button>
        <div class="login-guide-center-detail-head">
            <span class="login-guide-center-detail-icon">${moduleIcon(guide.key, 'w-5 h-5')}</span>
            <div>
                <h4>${escHtml(title)}</h4>
                <p>${escHtml(guide.purpose)}</p>
            </div>
        </div>
        ${guideDetailHtml(guide)}`;
}

function helpCenterHtml() {
    const guides = centerFilteredGuides();
    if (!guides.some(guide => guide.key === activeCenterGuideKey)) {
        activeCenterGuideKey = guides[0]?.key || '';
    }
    const selected = LOGIN_MODULE_GUIDES.find(guide => guide.key === activeCenterGuideKey);
    return `
        <div class="login-guide-center-shell" id="login-guide-center-shell">
            <aside class="login-guide-center-sidebar">
                <label class="login-guide-center-search">
                    <span class="sr-only">ค้นหาวิธีใช้งานโมดูล</span>
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input type="search" id="login-guide-center-search" value="${escHtml(activeCenterFilter)}" placeholder="ค้นหาวิธีใช้งานโมดูล" autocomplete="off">
                </label>
                <div class="login-guide-center-filters" id="login-guide-center-filters">
                    ${CENTER_GROUPS.map(group => `<button type="button" class="${group.key === activeCenterGroup ? 'is-active' : ''}" data-guide-group="${group.key}">${escHtml(group.label)}</button>`).join('')}
                </div>
                <div class="login-guide-center-list" id="login-guide-center-list">
                    ${centerListHtml(guides)}
                </div>
            </aside>
            <div class="login-guide-center-detail" id="login-guide-center-detail">
                ${centerDetailHtml(selected)}
            </div>
        </div>`;
}

function renderHelpCenter() {
    const shell = document.getElementById('login-guide-center-shell');
    const list = document.getElementById('login-guide-center-list');
    const detail = document.getElementById('login-guide-center-detail');
    const filters = document.getElementById('login-guide-center-filters');
    if (!list || !detail) return;

    const guides = centerFilteredGuides();
    if (!guides.some(guide => guide.key === activeCenterGuideKey)) {
        activeCenterGuideKey = guides[0]?.key || '';
        shell?.classList.remove('is-mobile-detail');
    }
    const selected = LOGIN_MODULE_GUIDES.find(guide => guide.key === activeCenterGuideKey);
    list.innerHTML = centerListHtml(guides);
    detail.innerHTML = centerDetailHtml(selected);
    filters?.querySelectorAll('[data-guide-group]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.guideGroup === activeCenterGroup);
    });
}

function openGuideCenter() {
    activeCenterFilter = '';
    activeCenterGroup = 'all';
    activeCenterGuideKey = LOGIN_MODULE_GUIDES[0]?.key || '';
    openLoginGuideDialog('Help Center - คู่มือทุกโมดูล', helpCenterHtml(), true);
    setTimeout(() => {
        const search = document.getElementById('login-guide-center-search');
        search?.addEventListener('input', () => {
            activeCenterFilter = search.value;
            renderHelpCenter();
        });
        document.getElementById('login-guide-center-shell')?.addEventListener('click', (event) => {
            const groupBtn = event.target.closest('[data-guide-group]');
            if (groupBtn) {
                activeCenterGroup = groupBtn.dataset.guideGroup || 'all';
                renderHelpCenter();
                return;
            }
            if (event.target.closest('[data-guide-back]')) {
                document.getElementById('login-guide-center-shell')?.classList.remove('is-mobile-detail');
                return;
            }
            const item = event.target.closest('[data-guide-key]');
            const guide = LOGIN_MODULE_GUIDES.find(row => row.key === item?.dataset.guideKey);
            if (guide) {
                activeCenterGuideKey = guide.key;
                renderHelpCenter();
                document.getElementById('login-guide-center-shell')?.classList.add('is-mobile-detail');
            }
        });
    }, 0);
}

function openLoginGuideDialog(title, html, wide = false) {
    const wrapper = document.getElementById('modal-wrapper');
    const container = document.getElementById('modal-container');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    if (!wrapper || !container || !titleEl || !bodyEl) return;

    lastFocusedElement = document.activeElement;
    titleEl.textContent = title;
    bodyEl.innerHTML = html;
    wrapper.setAttribute('role', 'dialog');
    wrapper.setAttribute('aria-modal', 'true');
    wrapper.setAttribute('aria-labelledby', 'modal-title');
    wrapper.classList.add('login-guide-wrapper');
    container.classList.add('login-guide-modal');
    container.classList.toggle('login-guide-modal-wide', Boolean(wide));
    wrapper.classList.remove('hidden');
    requestAnimationFrame(() => {
        wrapper.classList.remove('opacity-0');
        container.classList.remove('scale-95');
        document.getElementById('modal-close-btn')?.focus();
    });
}

function closeLoginGuideDialog() {
    const wrapper = document.getElementById('modal-wrapper');
    const container = document.getElementById('modal-container');
    if (!wrapper || wrapper.classList.contains('hidden')) return;
    wrapper.classList.add('opacity-0');
    container?.classList.add('scale-95');
    setTimeout(() => {
        wrapper.classList.add('hidden');
        wrapper.removeAttribute('role');
        wrapper.removeAttribute('aria-modal');
        wrapper.removeAttribute('aria-labelledby');
        wrapper.classList.remove('login-guide-wrapper');
        container?.classList.remove('login-guide-modal', 'login-guide-modal-wide');
        if (lastFocusedElement?.focus) lastFocusedElement.focus();
    }, 180);
}

function bindDialogClose() {
    document.getElementById('modal-wrapper')?.addEventListener('click', (event) => {
        const routeLink = event.target.closest('[data-guide-open-route]');
        if (!routeLink) return;
        const route = String(routeLink.dataset.guideOpenRoute || '').trim();
        if (!MODULE_ORDER.includes(route)) return;
        event.preventDefault();
        window.__tshPendingGuideRoute = route;
        window.dispatchEvent(new CustomEvent('tsh:guide-route-intent', { detail: { route } }));
        closeLoginGuideDialog();
    });
    document.getElementById('modal-close-btn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        closeLoginGuideDialog();
    });
    document.getElementById('modal-backdrop')?.addEventListener('click', (event) => {
        event.stopPropagation();
        closeLoginGuideDialog();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeLoginGuideDialog();
            return;
        }
        if (event.key !== 'Tab') return;

        const wrapper = document.getElementById('modal-wrapper');
        if (!wrapper || wrapper.classList.contains('hidden')) return;
        const focusable = Array.from(wrapper.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter(el => !el.disabled && el.offsetParent !== null);
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
}

export function initLoginModuleGuides() {
    document.getElementById('login-security-indicators')?.remove();

    const desktopGrid = document.querySelector('#login-overlay .grid.grid-cols-2.gap-1\\.5');
    const desktopHost = desktopGrid?.parentElement;
    if (desktopHost) {
        desktopHost.innerHTML = desktopPanelHtml();
        desktopHost.querySelector('.login-guide-panel')?.addEventListener('click', (event) => {
            if (event.target.closest('[data-guide-all]')) {
                openGuideCenter();
                return;
            }
            const card = event.target.closest('[data-guide-key]');
            const guide = LOGIN_MODULE_GUIDES.find(item => item.key === card?.dataset.guideKey);
            if (guide) openGuideModal(guide);
        });
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm && !document.getElementById('login-guide-mobile-host')) {
        const mobileHost = document.createElement('div');
        mobileHost.id = 'login-guide-mobile-host';
        mobileHost.className = 'md:hidden mt-4';
        mobileHost.innerHTML = mobileHelpHtml();
        loginForm.insertAdjacentElement('afterend', mobileHost);
        mobileHost.addEventListener('click', openGuideCenter);
    }

    bindDialogClose();
}
