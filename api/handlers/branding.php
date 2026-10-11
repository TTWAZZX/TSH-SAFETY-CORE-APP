<?php
declare(strict_types=1);

const BRANDING_PUBLISHED_KEY = 'app_branding';
const BRANDING_DRAFT_KEY = 'app_branding_draft';
const BRANDING_VERSIONS_KEY = 'app_branding_versions';
const BRANDING_HISTORY_LIMIT = 12;

function branding_parse_json($raw, $fallback = null)
{
    if (!is_string($raw) || trim($raw) === '') return $fallback;
    $value = json_decode($raw, true);
    return is_array($value) ? $value : $fallback;
}

function branding_normalize(array $raw = []): array
{
    $focus = static function ($value): int {
        return is_numeric($value) ? max(0, min(100, (int) round((float) $value))) : 50;
    };
    $text = static function ($value, int $length): string {
        return mb_substr(trim((string) $value), 0, $length);
    };
    $appName = $text($raw['appName'] ?? 'TSH SCA', 80) ?: 'TSH SCA';
    $tagline = $text($raw['tagline'] ?? 'TSH Safety Core Activity', 80) ?: 'TSH Safety Core Activity';
    $safeUrl = static function ($value) use ($text): string {
        $url = $text($value, 1024);
        return $url === '' || str_starts_with($url, '/') || preg_match('/^https:\/\//i', $url) ? $url : '';
    };
    $tone = in_array((string) ($raw['loginAnnouncementTone'] ?? ''), ['info', 'warning', 'critical'], true)
        ? (string) $raw['loginAnnouncementTone']
        : 'info';
    $backgroundFit = ($raw['loginBackgroundFit'] ?? '') === 'contain' ? 'contain' : 'cover';
    return [
        'appName' => $appName,
        'tagline' => $tagline,
        'loginHeroTitle' => $text($raw['loginHeroTitle'] ?? '', 140),
        'loginHeroSubtitle' => $text($raw['loginHeroSubtitle'] ?? '', 180),
        'logoUrl' => $text($raw['logoUrl'] ?? '', 1024),
        'loginBackgroundUrl' => $text($raw['loginBackgroundUrl'] ?? '', 1024),
        'loginBackgroundFit' => $backgroundFit,
        'loginBackgroundFocusX' => $focus($raw['loginBackgroundFocusX'] ?? null),
        'loginBackgroundFocusY' => $focus($raw['loginBackgroundFocusY'] ?? null),
        'loginAnnouncementEnabled' => filter_var($raw['loginAnnouncementEnabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
        'loginAnnouncementTone' => $tone,
        'loginAnnouncementTitle' => $text($raw['loginAnnouncementTitle'] ?? '', 100),
        'loginAnnouncementMessage' => $text($raw['loginAnnouncementMessage'] ?? '', 300),
        'loginAnnouncementStartAt' => $text($raw['loginAnnouncementStartAt'] ?? '', 40),
        'loginAnnouncementEndAt' => $text($raw['loginAnnouncementEndAt'] ?? '', 40),
        'loginAnnouncementLinkLabel' => $text($raw['loginAnnouncementLinkLabel'] ?? '', 60),
        'loginAnnouncementUrl' => $safeUrl($raw['loginAnnouncementUrl'] ?? ''),
        'supportTitle' => $text($raw['supportTitle'] ?? 'ต้องการความช่วยเหลือ?', 80) ?: 'ต้องการความช่วยเหลือ?',
        'supportEmail' => $text($raw['supportEmail'] ?? '', 160),
        'supportPhone' => $text($raw['supportPhone'] ?? '', 40),
        'supportHours' => $text($raw['supportHours'] ?? '', 120),
        'supportLinkLabel' => $text($raw['supportLinkLabel'] ?? '', 60),
        'supportUrl' => $safeUrl($raw['supportUrl'] ?? ''),
    ];
}

function branding_actor(array $user): array
{
    return [
        'id' => mb_substr((string) ($user['id'] ?? $user['EmployeeID'] ?? 'admin'), 0, 50),
        'name' => mb_substr((string) ($user['name'] ?? $user['EmployeeName'] ?? 'Admin'), 0, 100),
    ];
}

function branding_uuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}

function branding_history($raw): array
{
    $parsed = branding_parse_json($raw, []);
    $items = is_array($parsed['items'] ?? null) ? array_slice($parsed['items'], -BRANDING_HISTORY_LIMIT) : [];
    $normalized = [];
    foreach ($items as $index => $item) {
        if (!is_array($item)) continue;
        $normalized[] = [
            'id' => mb_substr((string) ($item['id'] ?? ('legacy-' . ($index + 1))), 0, 80),
            'versionNo' => max(1, (int) ($item['versionNo'] ?? ($index + 1))),
            'value' => branding_normalize(is_array($item['value'] ?? null) ? $item['value'] : []),
            'publishedAt' => (string) ($item['publishedAt'] ?? ''),
            'publishedBy' => is_array($item['publishedBy'] ?? null) ? $item['publishedBy'] : null,
            'source' => ($item['source'] ?? '') === 'rollback' ? 'rollback' : 'publish',
            'restoredFromVersionId' => !empty($item['restoredFromVersionId']) ? mb_substr((string) $item['restoredFromVersionId'], 0, 80) : null,
            'note' => mb_substr(trim((string) ($item['note'] ?? '')), 0, 240),
        ];
    }
    return ['activeVersionId' => (string) ($parsed['activeVersionId'] ?? ''), 'items' => $normalized];
}

function branding_ensure_table(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS app_settings (
        key_name VARCHAR(100) PRIMARY KEY,
        value TEXT,
        UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function branding_rows(bool $lock = false): array
{
    $sql = 'SELECT key_name,value,UpdatedAt FROM app_settings WHERE key_name IN (?,?,?)' . ($lock ? ' FOR UPDATE' : '');
    $rows = db_rows($sql, [BRANDING_PUBLISHED_KEY, BRANDING_DRAFT_KEY, BRANDING_VERSIONS_KEY]);
    $map = [];
    foreach ($rows as $row) $map[strtolower((string) $row['key_name'])] = $row;
    return $map;
}

function branding_workspace(array $rows): array
{
    $publishedRow = $rows[BRANDING_PUBLISHED_KEY] ?? null;
    $draftRow = $rows[BRANDING_DRAFT_KEY] ?? null;
    $historyRow = $rows[BRANDING_VERSIONS_KEY] ?? null;
    $publishedRaw = branding_parse_json($publishedRow['value'] ?? null, []);
    $draftRaw = branding_parse_json($draftRow['value'] ?? null, null);
    $history = branding_history($historyRow['value'] ?? null);
    $versions = $history['items'];
    usort($versions, static fn($a, $b) => (int) $b['versionNo'] <=> (int) $a['versionNo']);
    return [
        'published' => branding_normalize(is_array($publishedRaw) ? $publishedRaw : []),
        'publishedUpdatedAt' => (string) (($publishedRaw['updatedAt'] ?? null) ?: ($publishedRow['UpdatedAt'] ?? '')),
        'activeVersionId' => (string) (($history['activeVersionId'] ?? '') ?: ($versions[0]['id'] ?? '')),
        'draft' => is_array($draftRaw) ? [
            'value' => branding_normalize(is_array($draftRaw['value'] ?? null) ? $draftRaw['value'] : []),
            'updatedAt' => (string) (($draftRaw['updatedAt'] ?? null) ?: ($draftRow['UpdatedAt'] ?? '')),
            'updatedBy' => is_array($draftRaw['updatedBy'] ?? null) ? $draftRaw['updatedBy'] : null,
            'baseVersionId' => (string) (($draftRaw['baseVersionId'] ?? null) ?: ($history['activeVersionId'] ?? '')),
        ] : null,
        'versions' => $versions,
        'historyLimit' => BRANDING_HISTORY_LIMIT,
    ];
}

function branding_upsert(string $key, array $value): void
{
    db_execute(
        'INSERT INTO app_settings(key_name,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),UpdatedAt=NOW()',
        [$key, json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]
    );
}

function branding_new_version(array $value, int $versionNo, array $who, string $source = 'publish', array $extra = []): array
{
    return [
        'id' => branding_uuid(),
        'versionNo' => $versionNo,
        'value' => branding_normalize($value),
        'publishedAt' => date(DATE_ATOM),
        'publishedBy' => $who,
        'source' => $source === 'rollback' ? 'rollback' : 'publish',
        'restoredFromVersionId' => $extra['restoredFromVersionId'] ?? null,
        'note' => mb_substr(trim((string) ($extra['note'] ?? '')), 0, 240),
    ];
}

function branding_audit(array $user, string $action, string $targetId, array $metadata = []): void
{
    auth_audit_log($action, (string) ($user['id'] ?? $user['EmployeeID'] ?? ''), 200, array_merge(['module' => 'settings', 'targetId' => $targetId], $metadata), $user);
}

function handle_branding_routes(string $method, string $path): bool
{
    if (strpos($path, '/branding/') !== 0) return false;
    $user = require_admin();
    branding_ensure_table();

    if ($method === 'GET' && $path === '/branding/workspace') {
        json_response(['success' => true, 'data' => branding_workspace(branding_rows())]);
    }

    if ($method === 'PUT' && $path === '/branding/draft') {
        $body = json_body();
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $current = branding_workspace(branding_rows(true));
            $expected = (string) ($body['expectedDraftUpdatedAt'] ?? '');
            if ($expected !== '' && $expected !== (string) ($current['draft']['updatedAt'] ?? '')) {
                $pdo->rollBack();
                json_response(['success' => false, 'code' => 'BRANDING_DRAFT_CONFLICT', 'message' => 'Draft ถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลใหม่'], 409);
            }
            $who = branding_actor($user);
            $draft = [
                'value' => branding_normalize(is_array($body['value'] ?? null) ? $body['value'] : []),
                'updatedAt' => date(DATE_ATOM),
                'updatedBy' => $who,
                'baseVersionId' => (string) ($current['activeVersionId'] ?? ''),
            ];
            branding_upsert(BRANDING_DRAFT_KEY, $draft);
            $pdo->commit();
            branding_audit($user, 'SAVE_BRANDING_DRAFT', BRANDING_DRAFT_KEY, ['baseVersionId' => $draft['baseVersionId']]);
            json_response(['success' => true, 'data' => $draft]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    if ($method === 'DELETE' && $path === '/branding/draft') {
        $body = json_body();
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $current = branding_workspace(branding_rows(true));
            $expected = (string) ($body['expectedDraftUpdatedAt'] ?? '');
            if (!$current['draft'] || $expected === '' || $expected !== (string) $current['draft']['updatedAt']) {
                $pdo->rollBack();
                json_response(['success' => false, 'code' => 'BRANDING_DRAFT_CONFLICT', 'message' => 'Draft เปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลใหม่ก่อนทิ้ง Draft'], 409);
            }
            db_execute('DELETE FROM app_settings WHERE key_name=?', [BRANDING_DRAFT_KEY]);
            $pdo->commit();
            branding_audit($user, 'DISCARD_BRANDING_DRAFT', BRANDING_DRAFT_KEY);
            json_response(['success' => true]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    if ($method === 'POST' && $path === '/branding/publish') {
        $body = json_body();
        if (($body['confirmation'] ?? '') !== 'PUBLISH_BRANDING') {
            json_response(['success' => false, 'code' => 'BRANDING_CONFIRMATION_REQUIRED', 'message' => 'กรุณายืนยันการ Publish Branding'], 400);
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $rows = branding_rows(true);
            $current = branding_workspace($rows);
            if (!$current['draft']) {
                $pdo->rollBack();
                json_response(['success' => false, 'code' => 'BRANDING_DRAFT_REQUIRED', 'message' => 'ไม่พบ Draft สำหรับ Publish'], 409);
            }
            $expected = (string) ($body['expectedDraftUpdatedAt'] ?? '');
            if ($expected === '' || $expected !== (string) $current['draft']['updatedAt']) {
                $pdo->rollBack();
                json_response(['success' => false, 'code' => 'BRANDING_DRAFT_CONFLICT', 'message' => 'Draft เปลี่ยนแปลงแล้ว กรุณาตรวจสอบก่อน Publish'], 409);
            }
            $history = branding_history($rows[BRANDING_VERSIONS_KEY]['value'] ?? null);
            $who = branding_actor($user);
            if (!$history['items'] && !empty($rows[BRANDING_PUBLISHED_KEY]['value'])) {
                $history['items'][] = branding_new_version($current['published'], 1, ['id' => 'legacy', 'name' => 'Existing setting'], 'publish', ['note' => 'Imported existing published Branding']);
            }
            $nextNo = 1;
            foreach ($history['items'] as $item) $nextNo = max($nextNo, (int) $item['versionNo'] + 1);
            $version = branding_new_version($current['draft']['value'], $nextNo, $who, 'publish', ['note' => $body['note'] ?? '']);
            $history['items'][] = $version;
            $history['items'] = array_slice($history['items'], -BRANDING_HISTORY_LIMIT);
            $history['activeVersionId'] = $version['id'];
            $published = array_merge($version['value'], ['updatedAt' => $version['publishedAt'], 'updatedBy' => $who, 'versionId' => $version['id'], 'versionNo' => $version['versionNo']]);
            branding_upsert(BRANDING_PUBLISHED_KEY, $published);
            branding_upsert(BRANDING_VERSIONS_KEY, $history);
            db_execute('DELETE FROM app_settings WHERE key_name=?', [BRANDING_DRAFT_KEY]);
            $pdo->commit();
            branding_audit($user, 'PUBLISH_BRANDING', $version['id'], ['versionNo' => $version['versionNo'], 'source' => 'publish']);
            json_response(['success' => true, 'data' => branding_workspace(branding_rows())]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    $rollback = route_params($path, '/branding/versions/:versionId/rollback');
    if ($method === 'POST' && $rollback !== null) {
        $body = json_body();
        if (($body['confirmation'] ?? '') !== 'ROLLBACK_BRANDING') {
            json_response(['success' => false, 'code' => 'BRANDING_CONFIRMATION_REQUIRED', 'message' => 'กรุณายืนยันการ Rollback Branding'], 400);
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $rows = branding_rows(true);
            $current = branding_workspace($rows);
            $expected = (string) ($body['expectedActiveVersionId'] ?? '');
            if ($expected !== '' && $expected !== (string) ($current['activeVersionId'] ?? '')) {
                $pdo->rollBack();
                json_response(['success' => false, 'code' => 'BRANDING_VERSION_CONFLICT', 'message' => 'เวอร์ชันที่เผยแพร่เปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่'], 409);
            }
            $history = branding_history($rows[BRANDING_VERSIONS_KEY]['value'] ?? null);
            $target = null;
            foreach ($history['items'] as $item) if ((string) $item['id'] === (string) $rollback['versionId']) $target = $item;
            if (!$target) {
                $pdo->rollBack();
                json_response(['success' => false, 'code' => 'BRANDING_VERSION_NOT_FOUND', 'message' => 'ไม่พบ Branding version ที่เลือก'], 404);
            }
            $nextNo = 1;
            foreach ($history['items'] as $item) $nextNo = max($nextNo, (int) $item['versionNo'] + 1);
            $who = branding_actor($user);
            $version = branding_new_version($target['value'], $nextNo, $who, 'rollback', ['restoredFromVersionId' => $target['id'], 'note' => $body['note'] ?? '']);
            $history['items'][] = $version;
            $history['items'] = array_slice($history['items'], -BRANDING_HISTORY_LIMIT);
            $history['activeVersionId'] = $version['id'];
            $published = array_merge($version['value'], ['updatedAt' => $version['publishedAt'], 'updatedBy' => $who, 'versionId' => $version['id'], 'versionNo' => $version['versionNo']]);
            branding_upsert(BRANDING_PUBLISHED_KEY, $published);
            branding_upsert(BRANDING_VERSIONS_KEY, $history);
            $pdo->commit();
            branding_audit($user, 'ROLLBACK_BRANDING', $version['id'], ['versionNo' => $version['versionNo'], 'restoredFromVersionId' => $target['id']]);
            json_response(['success' => true, 'data' => branding_workspace(branding_rows())]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    return false;
}
