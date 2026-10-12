-- Admin-managed File Library category master. Additive and idempotent.

ALTER TABLE FileLibrary_Items
  ADD COLUMN IF NOT EXISTS CategoryDetail VARCHAR(120) NULL AFTER Category;

CREATE TABLE IF NOT EXISTS FileLibrary_Categories (
  id BIGINT NOT NULL AUTO_INCREMENT,
  Code VARCHAR(80) NOT NULL,
  LabelTh VARCHAR(120) NOT NULL,
  LabelEn VARCHAR(120) NULL,
  SortOrder INT NOT NULL DEFAULT 100,
  IsActive TINYINT(1) NOT NULL DEFAULT 1,
  IsSystem TINYINT(1) NOT NULL DEFAULT 0,
  CreatedBy VARCHAR(50) NOT NULL,
  UpdatedBy VARCHAR(50) NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_file_library_category_code (Code),
  KEY idx_file_library_category_active_sort (IsActive, SortOrder, LabelTh)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO FileLibrary_Categories(Code,LabelTh,LabelEn,SortOrder,IsActive,IsSystem,CreatedBy,UpdatedBy) VALUES
('POLICY_GOVERNANCE','นโยบายและการกำกับดูแล','Policy & Governance',10,1,1,'migration','migration'),
('PROCEDURE_SOP','ระเบียบปฏิบัติและ SOP','Procedures & SOP',20,1,1,'migration','migration'),
('FORM_TEMPLATE','แบบฟอร์มและแม่แบบ','Forms & Templates',30,1,1,'migration','migration'),
('SAFETY_COMPLIANCE','ความปลอดภัยและการปฏิบัติตามข้อกำหนด','Safety & Compliance',40,1,1,'migration','migration'),
('TRAINING_LEARNING','การฝึกอบรมและการเรียนรู้','Training & Learning',50,1,1,'migration','migration'),
('TECHNICAL_MANUAL','คู่มือทางเทคนิคและการใช้งาน','Technical Manuals',60,1,1,'migration','migration'),
('REPORT_ANALYTICS','รายงานและการวิเคราะห์','Reports & Analytics',70,1,1,'migration','migration'),
('CERTIFICATE_LICENSE','ใบรับรองและใบอนุญาต','Certificates & Licenses',80,1,1,'migration','migration'),
('COMMUNICATION_ANNOUNCEMENT','ประกาศและการสื่อสาร','Communications & Announcements',90,1,1,'migration','migration'),
('HR_PEOPLE','ทรัพยากรบุคคล','HR & People',100,1,1,'migration','migration'),
('PROCUREMENT_CONTRACT','จัดซื้อและสัญญา','Procurement & Contracts',110,1,1,'migration','migration'),
('PROJECT_DOCUMENT','เอกสารโครงการ','Project Documents',120,1,1,'migration','migration'),
('MEDIA_BRAND','สื่อและอัตลักษณ์องค์กร','Media & Brand Assets',130,1,1,'migration','migration'),
('OTHER','อื่น ๆ','Other',999,1,1,'migration','migration')
ON DUPLICATE KEY UPDATE Code=VALUES(Code);
