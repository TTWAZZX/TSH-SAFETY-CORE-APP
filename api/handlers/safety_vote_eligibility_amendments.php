<?php
declare(strict_types=1);

const SAFETY_VOTE_ELIGIBILITY_AMENDMENT_CONTRACT = '2026-10-20-safety-vote-eligibility-amendments-r1';

function svam_campaign(int $campaignId, bool $lock = false): ?array
{
    return db_row("SELECT c.id,c.CampaignCode,c.Status,c.CurrentVersionID,v.VersionNo,v.Status VersionStatus,v.EligibilityEnrollmentMode FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID WHERE c.id=?" . ($lock ? ' FOR UPDATE' : ''), [$campaignId]);
}

function svam_feature_enabled(bool $lock = false): bool
{
    $row = db_row("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='eligibility_amendment_enabled'" . ($lock ? ' FOR UPDATE' : ''));
    return (string)($row['SettingValue'] ?? '0') === '1';
}

function svam_voter(array $row): array
{
    return [
        'employeeId' => (string)$row['employeeId'], 'employeeName' => (string)($row['employeeName'] ?? ''),
        'departmentId' => isset($row['departmentId']) ? (int)$row['departmentId'] : null, 'departmentName' => (string)($row['departmentName'] ?? ''),
        'safetyUnitId' => isset($row['safetyUnitId']) ? (int)$row['safetyUnitId'] : null, 'safetyUnitName' => (string)($row['safetyUnitName'] ?? ''),
        'positionId' => isset($row['positionId']) ? (int)$row['positionId'] : null, 'positionName' => (string)($row['positionName'] ?? ''),
        'role' => (string)($row['role'] ?? ''), 'team' => (string)($row['team'] ?? ''),
        'masterPresent' => !isset($row['masterPresent']) || (bool)$row['masterPresent'], 'accountReady' => (bool)($row['accountReady'] ?? false),
        'inclusionSource' => (string)($row['inclusionSource'] ?? 'rule'), 'inclusionReason' => ($row['inclusionReason'] ?? null) !== null ? (string)$row['inclusionReason'] : null,
        'masterWarnings' => is_array($row['masterWarnings'] ?? null) ? array_values($row['masterWarnings']) : [],
    ];
}

function svam_preview(int $campaignId, bool $lock = false): array
{
    $campaign = svam_campaign($campaignId, $lock);
    if (!$campaign) return ['error' => [404, 'CAMPAIGN_NOT_FOUND', 'Campaign was not found.']];
    if (!in_array((string)$campaign['Status'], ['Scheduled', 'Open'], true)) return ['error' => [409, 'CAMPAIGN_STATE_CONFLICT', 'Eligibility amendments are available only for Scheduled or Open campaigns.']];
    $mode = (string)($campaign['EligibilityEnrollmentMode'] ?? 'closed_after_open');
    if (!in_array($mode, ['admin_approval', 'automatic_rule_match'], true)) return ['error' => [409, 'ELIGIBILITY_ENROLLMENT_CLOSED', 'This campaign does not accept new eligible voters after opening.']];
    $source = db_row("SELECT * FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=? AND Status='frozen' ORDER BY SnapshotNo DESC LIMIT 1" . ($lock ? ' FOR UPDATE' : ''), [(int)$campaign['CurrentVersionID']]);
    if (!$source) return ['error' => [409, 'FROZEN_SNAPSHOT_REQUIRED', 'A frozen eligibility snapshot is required before an amendment.']];
    $stored = db_rows('SELECT RuleGroup ruleGroup,RuleOrder ruleOrder,Effect effect,AttributeKey attributeKey,Operator operator,ValuesJson,Reason reason FROM SafetyVote_EligibilityRules WHERE CampaignVersionID=? AND IsActive=1 ORDER BY RuleGroup,RuleOrder,id', [(int)$campaign['CurrentVersionID']]);
    foreach ($stored as &$rule) $rule['values'] = json_decode((string)$rule['ValuesJson'], true) ?: [];
    unset($rule);
    $parsed = sv_rules($stored);
    if (!$parsed['ok'] || !$parsed['rules']) return ['error' => [422, 'ELIGIBILITY_RULES_INVALID', 'Active eligibility rules are required.']];
    $master = sv_master_projection();
    $eligible = array_map('svam_voter', sv_evaluate($parsed['rules'], $master['employees']));
    $baselineRaw = db_rows('SELECT EmployeeID employeeId,EmployeeNameSnapshot employeeName,DepartmentIDSnapshot departmentId,DepartmentNameSnapshot departmentName,SafetyUnitIDSnapshot safetyUnitId,SafetyUnitNameSnapshot safetyUnitName,PositionIDSnapshot positionId,PositionNameSnapshot positionName,RoleSnapshot role,TeamSnapshot team,MasterPresent masterPresent,AccountReady accountReady,InclusionSource inclusionSource,InclusionReason inclusionReason FROM SafetyVote_EligibleVoters WHERE SnapshotID=? ORDER BY EmployeeID', [(int)$source['id']]);
    $baseline = array_map('svam_voter', $baselineRaw);
    $baselineIds = [];
    foreach ($baseline as $row) $baselineIds[$row['employeeId']] = true;
    $eligibleIds = [];
    foreach ($eligible as $row) $eligibleIds[$row['employeeId']] = true;
    $candidates = array_values(array_filter($eligible, fn($row) => !isset($baselineIds[$row['employeeId']])));
    $ignoredRemovalCount = count(array_filter($baseline, fn($row) => !isset($eligibleIds[$row['employeeId']])));
    $candidateSetHash = sv2_rows_hash($candidates);
    $ruleHash = sv_hash($parsed['rules']);
    $previewHash = sv2_hash(['campaignId' => (int)$campaign['id'], 'campaignVersionId' => (int)$campaign['CurrentVersionID'], 'sourceSnapshotId' => (int)$source['id'], 'sourceRowsHash' => (string)($source['RowsHash'] ?? ''), 'ruleHash' => $ruleHash, 'candidateSetHash' => $candidateSetHash, 'enrollmentMode' => $mode]);
    $warningCount = array_sum(array_map(fn($row) => count($row['masterWarnings']), $candidates));
    $accountReadyCount = count(array_filter($candidates, fn($row) => $row['accountReady']));
    return [
        'campaign' => $campaign, 'source' => $source, 'baseline' => $baseline, 'candidates' => $candidates,
        'ruleHash' => $ruleHash, 'candidateSetHash' => $candidateSetHash, 'previewHash' => $previewHash, 'ignoredRemovalCount' => $ignoredRemovalCount,
        'data' => [
            'contractVersion' => SAFETY_VOTE_ELIGIBILITY_AMENDMENT_CONTRACT, 'dryRun' => true, 'addOnly' => true,
            'campaign' => ['id' => (int)$campaign['id'], 'campaignCode' => $campaign['CampaignCode'], 'status' => $campaign['Status'], 'versionId' => (int)$campaign['CurrentVersionID'], 'versionNo' => (int)$campaign['VersionNo'], 'enrollmentMode' => $mode],
            'sourceSnapshot' => ['id' => (int)$source['id'], 'snapshotNo' => (int)$source['SnapshotNo'], 'eligibleCount' => (int)$source['EligibleCount'], 'rowsHash' => $source['RowsHash'], 'snapshotKind' => $source['SnapshotKind'] ?: 'initial_freeze'],
            'candidateCount' => count($candidates), 'accountReadyCount' => $accountReadyCount, 'warningCount' => $warningCount,
            'ignoredRemovalCount' => $ignoredRemovalCount, 'candidateSetHash' => $candidateSetHash, 'previewHash' => $previewHash,
            'rows' => array_slice($candidates, 0, 250), 'truncated' => count($candidates) > 250,
        ],
    ];
}

function svam_event(array $user, array $amendment, string $eventType, ?string $fromStatus, string $toStatus, string $detail, array $metadata, ?string $previousHash, int $sequence): string
{
    $payload = ['amendmentId' => (int)$amendment['id'], 'campaignId' => (int)$amendment['campaignId'], 'campaignVersionId' => (int)$amendment['versionId'], 'eventSequence' => $sequence, 'eventType' => $eventType, 'actorEmployeeId' => sv_actor($user), 'actorRole' => sv_role($user), 'fromStatus' => $fromStatus, 'toStatus' => $toStatus, 'boundedDetail' => $detail, 'metadata' => $metadata, 'previousEventHash' => $previousHash];
    $eventHash = sv2_hash($payload);
    db_execute('INSERT INTO SafetyVote_EligibilityAmendmentEvents(AmendmentID,CampaignID,CampaignVersionID,EventSequence,EventType,ActorEmployeeID,ActorRole,FromStatus,ToStatus,BoundedDetail,MetadataJson,PreviousEventHash,EventHash,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [(int)$amendment['id'], (int)$amendment['campaignId'], (int)$amendment['versionId'], $sequence, $eventType, sv_actor($user), sv_role($user), $fromStatus, $toStatus, $detail, json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $previousHash, $eventHash, (string)($_SERVER['REMOTE_ADDR'] ?? ''), mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255)]);
    return $eventHash;
}

function svam_overview(int $campaignId): ?array
{
    $campaign = svam_campaign($campaignId);
    if (!$campaign) return null;
    $enabled = svam_feature_enabled();
    $snapshot = db_row("SELECT id,SnapshotNo,Status,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,Reason,ParentSnapshotID,SnapshotKind FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=? AND Status='frozen' ORDER BY SnapshotNo DESC LIMIT 1", [(int)$campaign['CurrentVersionID']]);
    $rows = db_rows("SELECT id,SourceSnapshotID,ResultSnapshotID,EnrollmentMode,RequestType,Status,Reason,CandidateCount,ApprovedCount,AddedCount,SkippedCount,BeforeRowsHash,CandidateSetHash,AfterRowsHash,RequestedBy,RequestedAt,ReviewedBy,ReviewedAt,AppliedBy,AppliedAt FROM SafetyVote_EligibilityAmendments WHERE CampaignVersionID=? ORDER BY id DESC LIMIT 50", [(int)$campaign['CurrentVersionID']]);
    $mode = (string)($campaign['EligibilityEnrollmentMode'] ?? 'closed_after_open');
    return [
        'contractVersion' => SAFETY_VOTE_ELIGIBILITY_AMENDMENT_CONTRACT,
        'featureEnabled' => $enabled,
        'campaign' => ['id' => (int)$campaign['id'], 'campaignCode' => $campaign['CampaignCode'], 'status' => $campaign['Status'], 'versionId' => (int)$campaign['CurrentVersionID'], 'versionNo' => (int)$campaign['VersionNo']],
        'policy' => ['enrollmentMode' => $mode, 'configurable' => $enabled && in_array($campaign['Status'], ['Draft', 'Scheduled', 'Open'], true), 'previewAllowed' => $enabled && in_array($campaign['Status'], ['Scheduled', 'Open'], true) && in_array($mode, ['admin_approval', 'automatic_rule_match'], true), 'applyAllowed' => $enabled && in_array($campaign['Status'], ['Scheduled', 'Open'], true) && in_array($mode, ['admin_approval', 'automatic_rule_match'], true), 'addOnly' => true, 'allowedModes' => ['closed_after_open', 'admin_approval', 'automatic_rule_match']],
        'currentSnapshot' => $snapshot ? ['id' => (int)$snapshot['id'], 'snapshotNo' => (int)$snapshot['SnapshotNo'], 'status' => $snapshot['Status'], 'eligibleCount' => (int)$snapshot['EligibleCount'], 'accountReadyCount' => (int)$snapshot['AccountReadyCount'], 'warningCount' => (int)$snapshot['WarningCount'], 'rowsHash' => $snapshot['RowsHash'], 'frozenAt' => $snapshot['FrozenAt'], 'frozenBy' => $snapshot['FrozenBy'], 'reason' => $snapshot['Reason'], 'parentSnapshotId' => $snapshot['ParentSnapshotID'] ? (int)$snapshot['ParentSnapshotID'] : null, 'snapshotKind' => $snapshot['SnapshotKind'] ?: 'initial_freeze'] : null,
        'amendments' => array_map(fn($row) => ['id' => (int)$row['id'], 'sourceSnapshotId' => (int)$row['SourceSnapshotID'], 'resultSnapshotId' => $row['ResultSnapshotID'] ? (int)$row['ResultSnapshotID'] : null, 'enrollmentMode' => $row['EnrollmentMode'], 'requestType' => $row['RequestType'], 'status' => $row['Status'], 'reason' => $row['Reason'], 'candidateCount' => (int)$row['CandidateCount'], 'approvedCount' => (int)$row['ApprovedCount'], 'addedCount' => (int)$row['AddedCount'], 'skippedCount' => (int)$row['SkippedCount'], 'beforeRowsHash' => $row['BeforeRowsHash'], 'candidateSetHash' => $row['CandidateSetHash'], 'afterRowsHash' => $row['AfterRowsHash'], 'requestedBy' => $row['RequestedBy'], 'requestedAt' => $row['RequestedAt'], 'reviewedBy' => $row['ReviewedBy'], 'reviewedAt' => $row['ReviewedAt'], 'appliedBy' => $row['AppliedBy'], 'appliedAt' => $row['AppliedAt']], $rows),
    ];
}

function handle_safety_vote_eligibility_amendment_routes(string $method, string $path): bool
{
    $overviewRoute = route_params($path, '/safety-vote/admin/campaigns/:id/eligibility/amendments');
    $modeRoute = route_params($path, '/safety-vote/admin/campaigns/:id/eligibility/enrollment-mode');
    $previewRoute = route_params($path, '/safety-vote/admin/campaigns/:id/eligibility/amendments/preview');
    $applyRoute = route_params($path, '/safety-vote/admin/campaigns/:id/eligibility/amendments/apply');
    if ($overviewRoute === null && $modeRoute === null && $previewRoute === null && $applyRoute === null) return false;
    $user = require_user();
    sv_require_schema(true);
    sv_require_permission($user, 'SAFETY_VOTE_ELIGIBILITY_MANAGE');
    $id = sv_positive_int(($overviewRoute ?? $modeRoute ?? $previewRoute ?? $applyRoute)['id']);
    if (!$id) json_response(['success' => false, 'code' => 'VALIDATION_FAILED', 'message' => 'A valid campaign ID is required.'], 400);
    if ($overviewRoute !== null) {
        if ($method !== 'GET') json_response(['success' => false, 'code' => 'METHOD_NOT_ALLOWED'], 405);
        try { $data = svam_overview($id); if (!$data) json_response(['success' => false, 'code' => 'CAMPAIGN_NOT_FOUND', 'message' => 'Campaign was not found.'], 404); json_response(['success' => true, 'data' => $data]); }
        catch (Throwable $error) { error_log('[safety-vote] eligibility amendment overview failed: ' . $error->getMessage()); json_response(['success' => false, 'code' => 'ELIGIBILITY_AMENDMENT_OVERVIEW_FAILED', 'message' => 'Unable to load eligibility management status.'], 503); }
    }
    if ($modeRoute !== null) {
        if ($method !== 'PUT') json_response(['success' => false, 'code' => 'METHOD_NOT_ALLOWED'], 405);
        $body = json_body(); $mode = sv_clean($body['enrollmentMode'] ?? '', 32); $reason = sv_clean($body['reason'] ?? '', 500);
        if (!in_array($mode, ['closed_after_open', 'admin_approval', 'automatic_rule_match'], true) || mb_strlen($reason) < 10) json_response(['success' => false, 'code' => 'VALIDATION_FAILED', 'message' => 'Campaign, enrollment mode and a reason of at least 10 characters are required.'], 400);
        $pdo = db(); $pdo->beginTransaction();
        try {
            if (!svam_feature_enabled(true)) { $pdo->rollBack(); json_response(['success' => false, 'code' => 'ELIGIBILITY_AMENDMENT_DISABLED', 'message' => 'Eligibility amendments are disabled.'], 503); }
            $campaign = svam_campaign($id, true);
            if (!$campaign) { $pdo->rollBack(); json_response(['success' => false, 'code' => 'CAMPAIGN_NOT_FOUND', 'message' => 'Campaign was not found.'], 404); }
            if (!in_array($campaign['Status'], ['Draft', 'Scheduled', 'Open'], true)) { $pdo->rollBack(); json_response(['success' => false, 'code' => 'CAMPAIGN_STATE_CONFLICT', 'message' => 'Enrollment policy is read-only after the campaign closes.'], 409); }
            if ($campaign['Status'] !== 'Draft' && ($body['confirmation'] ?? '') !== 'SET ' . $campaign['CampaignCode'] . ' ' . $mode) { $pdo->rollBack(); json_response(['success' => false, 'code' => 'ENROLLMENT_MODE_CONFIRMATION_REQUIRED', 'message' => 'Exact campaign and enrollment mode confirmation is required.'], 400); }
            $previous = (string)($campaign['EligibilityEnrollmentMode'] ?? 'closed_after_open'); $changed = $previous !== $mode;
            if ($changed) {
                db_execute('UPDATE SafetyVote_CampaignVersions SET EligibilityEnrollmentMode=?,EligibilityEnrollmentUpdatedAt=NOW(),EligibilityEnrollmentUpdatedBy=?,UpdatedAt=NOW() WHERE id=?', [$mode, sv_actor($user), (int)$campaign['CurrentVersionID']]);
                db_execute('INSERT INTO SafetyVote_AuditLogs(CampaignID,CampaignVersionID,ActorEmployeeID,ActorRole,Action,TargetType,TargetID,StatusCode,BoundedDetail,MetadataJson,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [$id, (int)$campaign['CurrentVersionID'], sv_actor($user), sv_role($user), 'SAFETY_VOTE_ELIGIBILITY_ENROLLMENT_MODE_UPDATE', 'SafetyVote_CampaignVersion', (string)$campaign['CurrentVersionID'], 200, $reason, json_encode(['previousMode' => $previous, 'enrollmentMode' => $mode, 'campaignStatus' => $campaign['Status']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), (string)($_SERVER['REMOTE_ADDR'] ?? ''), mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255)]);
            }
            $pdo->commit(); json_response(['success' => true, 'data' => ['contractVersion' => SAFETY_VOTE_ELIGIBILITY_AMENDMENT_CONTRACT, 'campaignId' => $id, 'campaignVersionId' => (int)$campaign['CurrentVersionID'], 'campaignStatus' => $campaign['Status'], 'previousMode' => $previous, 'enrollmentMode' => $mode, 'changed' => $changed]]);
        } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); error_log('[safety-vote] eligibility enrollment mode update failed: ' . $error->getMessage()); json_response(['success' => false, 'code' => 'ELIGIBILITY_ENROLLMENT_MODE_UPDATE_FAILED', 'message' => 'Unable to update eligibility enrollment mode.'], 500); }
    }
    if ($method !== 'POST') json_response(['success' => false, 'code' => 'METHOD_NOT_ALLOWED'], 405);
    if ($previewRoute !== null) {
        if (!svam_feature_enabled()) json_response(['success' => false, 'code' => 'ELIGIBILITY_AMENDMENT_DISABLED', 'message' => 'Eligibility amendments are disabled.'], 503);
        try {
            $result = svam_preview($id);
            if (isset($result['error'])) json_response(['success' => false, 'code' => $result['error'][1], 'message' => $result['error'][2]], $result['error'][0]);
            json_response(['success' => true, 'data' => $result['data']]);
        } catch (Throwable $error) {
            error_log('[safety-vote] eligibility amendment preview failed: ' . $error->getMessage());
            json_response(['success' => false, 'code' => 'ELIGIBILITY_AMENDMENT_PREVIEW_FAILED', 'message' => 'Unable to preview new eligible voters.'], 503);
        }
    }
    $body = json_body();
    $reason = sv_clean($body['reason'] ?? '', 500);
    $suppliedPreviewHash = strtolower(sv_clean($body['previewHash'] ?? '', 64));
    $idempotencyKey = sv_clean($_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? '', 200);
    if ($reason === '' || !preg_match('/^[a-f0-9]{64}$/', $suppliedPreviewHash) || strlen($idempotencyKey) < 16) json_response(['success' => false, 'code' => 'VALIDATION_FAILED', 'message' => 'Campaign, reason, preview hash and a valid Idempotency-Key are required.'], 400);
    $keyHash = hash('sha256', $idempotencyKey);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        if (!svam_feature_enabled(true)) { $pdo->rollBack(); json_response(['success' => false, 'code' => 'ELIGIBILITY_AMENDMENT_DISABLED', 'message' => 'Eligibility amendments are disabled.'], 503); }
        $replay = db_row('SELECT * FROM SafetyVote_EligibilityAmendments WHERE CampaignVersionID=(SELECT CurrentVersionID FROM SafetyVote_Campaigns WHERE id=?) AND IdempotencyKeyHash=? LIMIT 1 FOR UPDATE', [$id, $keyHash]);
        if ($replay) {
            $pdo->rollBack();
            if ($replay['Status'] !== 'Applied') json_response(['success' => false, 'code' => 'IDEMPOTENCY_CONFLICT', 'message' => 'This idempotency key belongs to an unfinished amendment.'], 409);
            json_response(['success' => true, 'data' => ['contractVersion' => SAFETY_VOTE_ELIGIBILITY_AMENDMENT_CONTRACT, 'amendmentId' => (int)$replay['id'], 'status' => $replay['Status'], 'sourceSnapshotId' => (int)$replay['SourceSnapshotID'], 'resultSnapshotId' => (int)$replay['ResultSnapshotID'], 'addedCount' => (int)$replay['AddedCount'], 'skippedCount' => (int)$replay['SkippedCount'], 'afterRowsHash' => $replay['AfterRowsHash'], 'replayed' => true]]);
        }
        $result = svam_preview($id, true);
        if (isset($result['error'])) { $pdo->rollBack(); json_response(['success' => false, 'code' => $result['error'][1], 'message' => $result['error'][2]], $result['error'][0]); }
        if (($body['confirmation'] ?? '') !== 'APPLY ' . $result['campaign']['CampaignCode']) { $pdo->rollBack(); json_response(['success' => false, 'code' => 'AMENDMENT_CONFIRMATION_REQUIRED', 'message' => 'Exact campaign confirmation is required.'], 400); }
        if (!hash_equals($result['previewHash'], $suppliedPreviewHash)) { $pdo->rollBack(); json_response(['success' => false, 'code' => 'ELIGIBILITY_PREVIEW_STALE', 'message' => 'Eligibility changed after preview. Run preview again.'], 409); }
        if (!$result['candidates']) { $pdo->rollBack(); json_response(['success' => false, 'code' => 'NO_NEW_ELIGIBLE_VOTERS', 'message' => 'No new eligible voters are available to add.'], 409); }
        $mode = (string)$result['campaign']['EligibilityEnrollmentMode'];
        $requestType = $mode === 'automatic_rule_match' ? 'automatic_rule_match' : 'manual_apply';
        $stmt = $pdo->prepare("INSERT INTO SafetyVote_EligibilityAmendments(CampaignID,CampaignVersionID,SourceSnapshotID,EnrollmentMode,RequestType,Status,Reason,CandidateCount,ApprovedCount,BeforeRowsHash,CandidateSetHash,IdempotencyKeyHash,RequestedBy,ReviewedBy,ReviewedAt) VALUES(?,?,?,?,?,'Approved',?,?,?,?,?,?,?,?,NOW())");
        $stmt->execute([$id, $result['campaign']['CurrentVersionID'], $result['source']['id'], $mode, $requestType, $reason, count($result['candidates']), count($result['candidates']), $result['source']['RowsHash'], $result['candidateSetHash'], $keyHash, sv_actor($user), sv_actor($user)]);
        $amendmentId = (int)$pdo->lastInsertId();
        $member = $pdo->prepare('INSERT INTO SafetyVote_EligibilityAmendmentMembers(AmendmentID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,SourceType,SourceReason,MasterWarningsJson,MemberStatus,DecisionReason,DecidedBy,DecidedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())');
        foreach ($result['candidates'] as $row) $member->execute([$amendmentId, $row['employeeId'], $row['employeeName'], $row['departmentId'], $row['departmentName'], $row['safetyUnitId'], $row['safetyUnitName'], $row['positionId'], $row['positionName'], $row['role'], $row['team'], $row['masterPresent'] ? 1 : 0, $row['accountReady'] ? 1 : 0, 'rule_match', $row['inclusionReason'], json_encode($row['masterWarnings']), 'Approved', $reason, sv_actor($user)]);
        $amendment = ['id' => $amendmentId, 'campaignId' => $id, 'versionId' => (int)$result['campaign']['CurrentVersionID']];
        $eventHash = svam_event($user, $amendment, 'REQUESTED', null, 'Pending', $reason, ['candidateCount' => count($result['candidates']), 'candidateSetHash' => $result['candidateSetHash']], null, 1);
        $eventHash = svam_event($user, $amendment, 'APPROVED', 'Pending', 'Approved', $reason, ['approvedCount' => count($result['candidates']), 'enrollmentMode' => $mode], $eventHash, 2);
        $next = db_row('SELECT COALESCE(MAX(SnapshotNo),0)+1 snapshotNo FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=?', [(int)$result['campaign']['CurrentVersionID']]);
        $candidateWarnings = array_sum(array_map(fn($row) => count($row['masterWarnings']), $result['candidates']));
        $snapshot = $pdo->prepare("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,Reason,CreatedBy,ParentSnapshotID,SnapshotKind) VALUES(?,?,'building',?,NULL,0,0,?,NULL,NULL,?,?,?,'amendment')");
        $snapshot->execute([(int)$result['campaign']['CurrentVersionID'], (int)$next['snapshotNo'], $result['ruleHash'], (int)$result['source']['WarningCount'] + $candidateWarnings, $reason, sv_actor($user), (int)$result['source']['id']]);
        $resultSnapshotId = (int)$pdo->lastInsertId();
        db_execute('INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason,OverrideBy,OverrideAt,OverrideReason) SELECT ?,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason,OverrideBy,OverrideAt,OverrideReason FROM SafetyVote_EligibleVoters WHERE SnapshotID=?', [$resultSnapshotId, (int)$result['source']['id']]);
        $voter = $pdo->prepare("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason,OverrideBy,OverrideAt,OverrideReason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'eligible',?,?,?,NOW(),?)");
        foreach ($result['candidates'] as $row) $voter->execute([$resultSnapshotId, $row['employeeId'], $row['employeeName'], $row['departmentId'], $row['departmentName'], $row['safetyUnitId'], $row['safetyUnitName'], $row['positionId'], $row['positionName'], $row['role'], $row['team'], $row['masterPresent'] ? 1 : 0, $row['accountReady'] ? 1 : 0, 'eligibility_amendment', $row['inclusionReason'], sv_actor($user), $reason]);
        $merged = db_rows('SELECT EmployeeID employeeId,DepartmentIDSnapshot departmentId,SafetyUnitIDSnapshot safetyUnitId,PositionIDSnapshot positionId,RoleSnapshot role,TeamSnapshot team,AccountReady accountReady FROM SafetyVote_EligibleVoters WHERE SnapshotID=? ORDER BY EmployeeID', [$resultSnapshotId]);
        foreach ($merged as &$row) $row['accountReady'] = (bool)$row['accountReady'];
        unset($row);
        $afterRowsHash = sv2_rows_hash($merged);
        $accountReadyCount = count(array_filter($merged, fn($row) => $row['accountReady']));
        db_execute("UPDATE SafetyVote_EligibilitySnapshots SET Status='superseded' WHERE id=? AND Status='frozen'", [(int)$result['source']['id']]);
        db_execute("UPDATE SafetyVote_EligibilitySnapshots SET Status='frozen',RowsHash=?,EligibleCount=?,AccountReadyCount=?,FrozenAt=NOW(),FrozenBy=? WHERE id=? AND Status='building'", [$afterRowsHash, count($merged), $accountReadyCount, sv_actor($user), $resultSnapshotId]);
        db_execute("UPDATE SafetyVote_EligibilityAmendmentMembers SET MemberStatus='Applied',AppliedAt=NOW() WHERE AmendmentID=? AND MemberStatus='Approved'", [$amendmentId]);
        db_execute("UPDATE SafetyVote_EligibilityAmendments SET ResultSnapshotID=?,Status='Applied',AddedCount=?,SkippedCount=0,AfterRowsHash=?,AppliedBy=?,AppliedAt=NOW(),MetadataJson=? WHERE id=?", [$resultSnapshotId, count($result['candidates']), $afterRowsHash, sv_actor($user), json_encode(['previewHash' => $result['previewHash'], 'ignoredRemovalCount' => $result['ignoredRemovalCount'], 'addOnly' => true]), $amendmentId]);
        svam_event($user, $amendment, 'APPLIED', 'Approved', 'Applied', $reason, ['sourceSnapshotId' => (int)$result['source']['id'], 'resultSnapshotId' => $resultSnapshotId, 'addedCount' => count($result['candidates']), 'afterRowsHash' => $afterRowsHash], $eventHash, 3);
        db_execute('INSERT INTO SafetyVote_AuditLogs(CampaignID,CampaignVersionID,ActorEmployeeID,ActorRole,Action,TargetType,TargetID,StatusCode,BoundedDetail,MetadataJson,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [$id, (int)$result['campaign']['CurrentVersionID'], sv_actor($user), sv_role($user), 'SAFETY_VOTE_ELIGIBILITY_AMENDMENT_APPLIED', 'SafetyVote_EligibilityAmendment', (string)$amendmentId, 201, 'added=' . count($result['candidates']) . '; sourceSnapshot=' . $result['source']['id'] . '; resultSnapshot=' . $resultSnapshotId, json_encode(['addedCount' => count($result['candidates']), 'sourceSnapshotId' => (int)$result['source']['id'], 'resultSnapshotId' => $resultSnapshotId, 'beforeRowsHash' => $result['source']['RowsHash'], 'afterRowsHash' => $afterRowsHash, 'candidateSetHash' => $result['candidateSetHash'], 'enrollmentMode' => $mode, 'addOnly' => true]), (string)($_SERVER['REMOTE_ADDR'] ?? ''), mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255)]);
        $pdo->commit();
        json_response(['success' => true, 'data' => ['contractVersion' => SAFETY_VOTE_ELIGIBILITY_AMENDMENT_CONTRACT, 'amendmentId' => $amendmentId, 'status' => 'Applied', 'sourceSnapshotId' => (int)$result['source']['id'], 'resultSnapshotId' => $resultSnapshotId, 'snapshotNo' => (int)$next['snapshotNo'], 'addedCount' => count($result['candidates']), 'skippedCount' => 0, 'afterRowsHash' => $afterRowsHash, 'replayed' => false]], 201);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ((string)$error->getCode() === '23000') json_response(['success' => false, 'code' => 'IDEMPOTENCY_CONFLICT', 'message' => 'The amendment was already requested.'], 409);
        error_log('[safety-vote] eligibility amendment apply failed: ' . $error->getMessage());
        json_response(['success' => false, 'code' => 'ELIGIBILITY_AMENDMENT_APPLY_FAILED', 'message' => 'Unable to apply the eligibility amendment.'], 500);
    }
}
