<?php
declare(strict_types=1);

const SAFETY_VOTE_WORKFLOW_PROFILE_CONTRACT = '2026-10-25-safety-vote-workflow-profile-r1';

function safety_vote_workflow_profiles(): array
{
    return [
        'survey' => ['contentModel'=>'questions','actionModel'=>'answer','participantRole'=>'respondent','contentLabel'=>'คำถามแบบสำรวจ','operationLabel'=>'กติกาการตอบ','participantLabel'=>'ผู้มีสิทธิ์ตอบ','eligibilityPolicy'=>'required','juryRequired'=>false,'publicGallery'=>false],
        'popular_vote' => ['contentModel'=>'voting_options','actionModel'=>'vote','participantRole'=>'voter','contentLabel'=>'รายการสำหรับลงคะแนน','operationLabel'=>'กติกาการลงคะแนน','participantLabel'=>'ผู้มีสิทธิ์ลงคะแนน','eligibilityPolicy'=>'required','juryRequired'=>false,'publicGallery'=>true],
        'secret_election' => ['contentModel'=>'ballot_candidates','actionModel'=>'secret_vote','participantRole'=>'elector','contentLabel'=>'บัตรและรายชื่อผู้สมัคร','operationLabel'=>'กติกาการเลือกตั้ง','participantLabel'=>'ผู้มีสิทธิ์เลือกตั้ง','eligibilityPolicy'=>'required','juryRequired'=>false,'publicGallery'=>false],
        'submission_challenge' => ['contentModel'=>'submission_form','actionModel'=>'submit','participantRole'=>'submitter','contentLabel'=>'แบบฟอร์มและไฟล์ผลงาน','operationLabel'=>'ขั้นตอนตรวจผลงาน','participantLabel'=>'ผู้มีสิทธิ์ส่งผลงาน','eligibilityPolicy'=>'required','juryRequired'=>false,'publicGallery'=>true],
        'nomination' => ['contentModel'=>'nomination_form','actionModel'=>'nominate','participantRole'=>'nominator','contentLabel'=>'หมวดและข้อมูลผู้ถูกเสนอ','operationLabel'=>'ขั้นตอนตรวจและยินยอม','participantLabel'=>'ผู้มีสิทธิ์เสนอชื่อ','eligibilityPolicy'=>'required','juryRequired'=>false,'publicGallery'=>false],
        'jury_scoring' => ['contentModel'=>'work_items','actionModel'=>'jury_score','participantRole'=>'conditional_submitter','contentLabel'=>'ผลงานที่เข้าประกวด','operationLabel'=>'เกณฑ์ตัดสินและรายชื่อกรรมการ','participantLabel'=>'ผู้ส่งผลงานและผู้เข้าร่วม','eligibilityPolicy'=>'conditional_by_work_source','juryRequired'=>true,'publicGallery'=>true],
    ];
}

function safety_vote_resolve_workflow_profile($input = [], array $options = []): array
{
    $row = is_string($input) ? ['campaignType'=>$input] : (is_array($input) ? $input : []);
    $profiles = safety_vote_workflow_profiles();
    $requestedType = strtolower((string)($row['campaignType'] ?? $row['CampaignType'] ?? 'survey'));
    $campaignType = array_key_exists($requestedType, $profiles) ? $requestedType : 'survey';
    $requestedSource = strtolower((string)($options['workSource'] ?? $row['workSource'] ?? $row['WorkSource'] ?? 'admin_curated'));
    $workSource = $campaignType === 'jury_scoring' && in_array($requestedSource, ['admin_curated','employee_submission','imported'], true) ? $requestedSource : null;
    $profile = $profiles[$campaignType];
    $eligibilityRequired = $profile['eligibilityPolicy'] === 'required' || ($campaignType === 'jury_scoring' && $workSource === 'employee_submission');
    return [
        'contractVersion'=>SAFETY_VOTE_WORKFLOW_PROFILE_CONTRACT,
        'campaignType'=>$campaignType,
        'workSource'=>$workSource,
        'contentModel'=>$profile['contentModel'],
        'actionModel'=>$profile['actionModel'],
        'participantRole'=>$profile['participantRole'],
        'contentLabel'=>$profile['contentLabel'],
        'operationLabel'=>$profile['operationLabel'],
        'participantLabel'=>$profile['participantLabel'],
        'eligibilityPolicy'=>$profile['eligibilityPolicy'],
        'eligibilityRequired'=>$eligibilityRequired,
        'juryRequired'=>$profile['juryRequired'],
        'publicGallery'=>$profile['publicGallery'],
        'companyViewerMayParticipate'=>false,
    ];
}
