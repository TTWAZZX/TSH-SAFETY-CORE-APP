const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const nodeRoute = read('backend/routes/ky.js');
const phpRoute = read('api/handlers/workflow_phase6.php');
const frontend = read('public/js/pages/ky.js');
const main = read('public/js/main.js');
const html = read('index.html');

for (const source of [nodeRoute, phpRoute]) {
    assert.match(source, /video-upload\/init/, 'chunk upload init endpoint must exist');
    assert.match(source, /video-upload\/.+chunk/, 'chunk receiver endpoint must exist');
    assert.match(source, /video-upload\/.+complete/, 'chunk completion endpoint must exist');
    assert.match(source, /200\s*\*\s*1024\s*\*\s*1024|200 \* 1024 \* 1024/, 'server must enforce 200 MB limit');
    assert.match(source, /ky-video-chunks/, 'chunks must use the private upload directory');
    assert.match(source, /VideoUrl/, 'completion must attach the assembled video to KY activity');
}

assert.match(nodeRoute, /kyCanUploadFollowupVideoForUser\(row, req\)/, 'Node must enforce existing KY video ownership');
assert.match(phpRoute, /wf_ky_can_upload_followup_video\(\$row, \$user\)/, 'PHP must enforce existing KY video ownership');
assert.match(nodeRoute, /kyVideoFileHeaderIsValid/, 'Node must validate assembled video signature');
assert.match(phpRoute, /wf_ky_video_header_valid/, 'PHP must validate assembled video signature');
assert.match(phpRoute, /KY_UPLOAD_REQUEST_TOO_LARGE/, 'PHP legacy multipart overflow must return an explanatory code');

assert.match(frontend, /async function uploadKyVideoInChunks/, 'frontend chunk orchestrator must exist');
assert.ok((frontend.match(/fd\.delete\('video'\)/g) || []).length >= 2, 'submit and Admin manage requests must exclude video from the main multipart body');
assert.match(frontend, /uploadKyVideoInChunks\(activityId, videoFile/, 'new KY submit must upload video after record creation');
assert.match(frontend, /uploadKyVideoInChunks\(record\.id, file/, 'follow-up video must use chunk upload');
assert.match(frontend, /uploadKyVideoInChunks\(r\.id, videoFile/, 'Admin video replacement must use chunk upload');
assert.match(frontend, /บันทึกกิจกรรม KY แล้ว แต่วิดีโออัปโหลดไม่สำเร็จ/, 'partial-success guidance must prevent duplicate KY resubmission');

assert.match(main, /ky\.js\?v=20260831-ky-chunk-upload-r1/, 'KY page cache key must be updated');
assert.match(html, /main\.js\?v=20260831-bbs-phase10c1-forklift-renewal-ky-chunk-r1/, 'SPA cache key must be updated');

console.log('KY chunked video upload contract: PASS');
