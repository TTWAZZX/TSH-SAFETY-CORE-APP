'use strict';

const runtime = [
  'api/index.php',
  'api/handlers/admin_phase8.php',
  'api/handlers/safety_vote.php',
  'api/handlers/safety_vote_phase2.php',
  'api/handlers/safety_vote_phase3.php',
  'api/handlers/safety_vote_phase4.php',
  'api/handlers/safety_vote_phase5.php',
  'api/handlers/safety_vote_phase6.php',
  'api/handlers/safety_vote_phase7.php',
  'api/lib/safety_vote_phase1.php',
  'api/lib/safety_vote_phase2.php',
  'api/lib/safety_vote_phase3.php',
  'api/lib/safety_vote_phase4.php',
  'api/lib/safety_vote_phase5.php',
  'api/lib/safety_vote_phase6.php',
  'api/lib/safety_vote_phase7.php',
  'api/private/.htaccess',
  'api/private/index.html',
  'index.html',
  'public/js/main.js',
  'public/js/module-meta.js',
  'public/js/pages/admin.js',
  'public/js/pages/admin-safety-vote.js',
  'public/js/pages/safety-vote.js'
];

const migrations = [1, 2, 3, 4, 5, 6, 7].flatMap((phase) => {
  const names = {
    1: 'foundation',
    2: 'core_mvp',
    3: 'survey_submission',
    4: 'jury_scoring',
    5: 'operations',
    6: 'secret_election',
    7: 'integrations_governance'
  };
  const base = `backend/migrations/20261008_safety_vote_phase${phase}_${names[phase]}`;
  return [`${base}.sql`, `${base}.rollback.sql`];
});

const sourceOnly = [
  'backend/server.js',
  'backend/routes/admin.js',
  'backend/routes/safety-vote.js',
  ...[2, 3, 4, 5, 6, 7].map((phase) => `backend/routes/safety-vote-phase${phase}.js`),
  ...[1, 2, 3, 4, 5, 6, 7].map((phase) => `backend/services/safety-vote-phase${phase}.js`),
  'backend/scripts/permission-audit.js',
  'backend/scripts/safety-vote-phase1-api-uat.js',
  'backend/scripts/safety-vote-phase1-node-fixture-host.js',
  'backend/scripts/safety-vote-phase1-php-router.php',
  'backend/scripts/safety-vote-phase3-api-uat.js',
  'backend/scripts/safety-vote-phase4-api-uat.js',
  'backend/scripts/safety-vote-phase5-api-uat.js',
  'backend/scripts/safety-vote-phase7-migration.test.js',
  'backend/scripts/safety-vote-phase82-protected-helper.php.template',
  'backend/scripts/safety-vote-phase82-protected-preflight.js',
  'backend/scripts/safety-vote-phase831-disabled-gate.test.js',
  'backend/package.json',
  'package.json'
];

const explicitExclusions = [
  {
    path: 'backend/scripts/patrol-checkin-v2.test.js',
    reason: 'pre-existing unrelated dirty file'
  },
  {
    path: 'api/private/safety-vote/',
    reason: 'private business files are backup data, never release payload'
  },
  {
    path: 'backend/private-uploads/',
    reason: 'private business files are backup data, never release payload'
  },
  {
    path: 'backups/',
    reason: 'local and Production evidence is never deployable runtime'
  }
];

module.exports = { runtime, migrations, sourceOnly, explicitExclusions };
