<?php
declare(strict_types=1);

function document_upload_rules(): array
{
    return [
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/png' => ['png'],
        'image/gif' => ['gif'],
        'image/webp' => ['webp'],
        'application/pdf' => ['pdf'],
        'application/msword' => ['doc'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => ['docx'],
        'application/vnd.ms-excel' => ['xls'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => ['xlsx'],
        'application/vnd.ms-powerpoint' => ['ppt'],
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => ['pptx'],
    ];
}

function ensure_module_forms_table(): void
{
    db()->exec(
        'CREATE TABLE IF NOT EXISTS module_forms (
            id INT AUTO_INCREMENT PRIMARY KEY,
            Module VARCHAR(50) NOT NULL,
            Title VARCHAR(200) NOT NULL,
            Description TEXT,
            FileUrl TEXT NOT NULL,
            PublicID VARCHAR(255),
            FileType VARCHAR(100),
            FileSize INT,
            Version VARCHAR(30),
            IsActive TINYINT(1) NOT NULL DEFAULT 1,
            SortOrder INT NOT NULL DEFAULT 99,
            UploadedBy VARCHAR(100),
            UploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_module (Module),
            INDEX idx_active (IsActive)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
}

function handle_storage_routes(string $method, string $path): bool
{
    if ($method === 'POST' && $path === '/upload/document') {
        require_admin();
        $file = store_uploaded_file('document', document_upload_rules(), 20 * 1024 * 1024);
        json_response(array_merge(['success' => true, 'message' => 'File uploaded successfully'], $file));
    }
    if ($method === 'POST' && $path === '/upload/branding-logo') {
        require_admin();
        $file = store_uploaded_file('logo', [
            'image/jpeg' => ['jpg', 'jpeg'],
            'image/png' => ['png'],
            'image/webp' => ['webp'],
        ], 2 * 1024 * 1024);
        json_response(array_merge(['success' => true, 'message' => 'Logo uploaded successfully'], $file));
    }
    if ($method === 'DELETE' && $path === '/upload/document') {
        require_admin();
        $body = json_body();
        $url = trim((string) ($body['url'] ?? $body['FileURL'] ?? ''));
        if ($url === '' || strpos($url, '/uploads/') === false) {
            json_response(['success' => false, 'message' => 'Uploaded file URL is required.'], 400);
        }
        json_response(['success' => true, 'deleted' => delete_uploaded_file($url)]);
    }

    if (strpos($path, '/module-forms') !== 0) {
        return false;
    }
    $user = require_user();
    ensure_module_forms_table();
    $allowedModules = ['hiyari', 'ky', 'fourm', 'cccf', 'general'];

    if ($method === 'GET' && $path === '/module-forms') {
        $module = trim((string) ($_GET['module'] ?? ''));
        if ($module !== '' && !in_array($module, $allowedModules, true)) {
            json_response(['success' => false, 'message' => 'Invalid module'], 400);
        }
        $sql = 'SELECT * FROM module_forms WHERE 1=1';
        $params = [];
        if ($module !== '') {
            $sql .= ' AND Module=?';
            $params[] = $module;
        }
        if (strcasecmp((string) ($user['role'] ?? ''), 'Admin') !== 0 || (string) ($_GET['all'] ?? '') !== '1') {
            $sql .= ' AND IsActive=1';
        }
        json_response(['success' => true, 'data' => db_rows($sql . ' ORDER BY SortOrder ASC, UploadedAt DESC', $params)]);
    }
    if ($method === 'POST' && $path === '/module-forms') {
        require_admin();
        $module = trim((string) ($_POST['module'] ?? ''));
        $title = trim((string) ($_POST['title'] ?? ''));
        if (!in_array($module, $allowedModules, true) || $title === '') {
            json_response(['success' => false, 'message' => 'Module and title are required.'], 400);
        }
        $file = store_uploaded_file('formFile', document_upload_rules(), 20 * 1024 * 1024);
        db_execute(
            'INSERT INTO module_forms (Module,Title,Description,FileUrl,PublicID,FileType,FileSize,Version,SortOrder,UploadedBy)
             VALUES (?,?,?,?,?,?,?,?,?,?)',
            [$module, $title, trim((string) ($_POST['description'] ?? '')) ?: null, $file['url'], $file['storedName'],
             $file['mimetype'], $file['size'], trim((string) ($_POST['version'] ?? '')) ?: null,
             (int) ($_POST['sortOrder'] ?? 99), (string) ($user['name'] ?? $user['id'] ?? '')]
        );
        json_response(['success' => true, 'message' => 'Form uploaded successfully']);
    }
    $params = route_params($path, '/module-forms/:id');
    if ($params !== null && $method === 'PUT') {
        require_admin();
        $body = json_body();
        $title = trim((string) ($body['title'] ?? ''));
        if ($title === '') {
            json_response(['success' => false, 'message' => 'Title is required.'], 400);
        }
        db_execute(
            'UPDATE module_forms SET Title=?,Description=?,Version=?,IsActive=?,SortOrder=? WHERE id=?',
            [$title, trim((string) ($body['description'] ?? '')) ?: null, trim((string) ($body['version'] ?? '')) ?: null,
             empty($body['isActive']) && array_key_exists('isActive', $body) ? 0 : 1, (int) ($body['sortOrder'] ?? 99), $params['id']]
        );
        json_response(['success' => true, 'message' => 'Form updated successfully']);
    }
    if ($params !== null && $method === 'DELETE') {
        require_admin();
        $row = db_row('SELECT FileUrl FROM module_forms WHERE id=? LIMIT 1', [$params['id']]);
        if (!$row) {
            json_response(['success' => false, 'message' => 'Form not found.'], 404);
        }
        delete_uploaded_file($row['FileUrl'] ?? '');
        db_execute('DELETE FROM module_forms WHERE id=?', [$params['id']]);
        json_response(['success' => true, 'message' => 'Form deleted successfully']);
    }
    return false;
}
