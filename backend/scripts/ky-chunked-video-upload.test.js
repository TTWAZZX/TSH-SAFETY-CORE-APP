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
    assert.match(source, /video-upload\/config/, 'server-driven upload config endpoint must exist');
    assert.match(source, /video-upload\/init/, 'chunk upload init endpoint must exist');
    assert.match(source, /video-upload\/.+chunk/, 'chunk receiver endpoint must exist');
    assert.match(source, /video-upload\/.+complete/, 'chunk completion endpoint must exist');
    assert.match(source, /200\s*\*\s*1024\s*\*\s*1024|200 \* 1024 \* 1024/, 'server must enforce 200 MB limit');
    assert.match(source, /ky-video-chunks/, 'chunks must use the private upload directory');
    assert.match(source, /VideoUrl/, 'completion must attach the assembled video to KY activity');
    assert.match(source, /KY_VIDEO_CHUNK_HASH_MISMATCH/, 'each server must reject a chunk whose SHA-256 does not match');
    assert.match(source, /KY_VIDEO_CHUNK_TOO_LARGE/, 'each server must expose a clear oversized-chunk error');
    assert.match(source, /sha256/, 'each server must return the assembled file SHA-256');
}

assert.match(nodeRoute, /kyCanUploadFollowupVideoForUser\(row, req\)/, 'Node must enforce existing KY video ownership');
assert.match(phpRoute, /wf_ky_can_upload_followup_video\(\$row, \$user\)/, 'PHP must enforce existing KY video ownership');
assert.match(nodeRoute, /kyVideoFileHeaderIsValid/, 'Node must validate assembled video signature');
assert.match(phpRoute, /wf_ky_video_header_valid/, 'PHP must validate assembled video signature');
assert.match(phpRoute, /KY_UPLOAD_REQUEST_TOO_LARGE/, 'PHP legacy multipart overflow must return an explanatory code');
assert.match(phpRoute, /upload_max_filesize/, 'PHP chunk size must account for upload_max_filesize');
assert.match(phpRoute, /post_max_size/, 'PHP chunk size must account for post_max_size');
assert.match(phpRoute, /\$maximum\s*=\s*256\s*\*\s*1024/, 'PHP adaptive chunk ceiling must be the Production-safe 256 KiB');
assert.match(nodeRoute, /KY_VIDEO_CHUNK_SIZE\s*=\s*256\s*\*\s*1024/, 'Node chunk ceiling must be the Production-safe 256 KiB');

assert.match(frontend, /async function uploadKyVideoInChunks/, 'frontend chunk orchestrator must exist');
assert.match(frontend, /loadKyVideoUploadConfig/, 'frontend must consume server-driven upload limits');
assert.match(frontend, /X-KY-Chunk-SHA256/, 'frontend must send a SHA-256 for every chunk');
assert.match(frontend, /API\.delete\(`\/ky\/\$\{encodeURIComponent\(activityId\)\}\/video-upload\/\$\{uploadId\}`/, 'frontend must abort and clean a failed upload');
assert.ok((frontend.match(/fd\.delete\('video'\)/g) || []).length >= 2, 'submit and Admin manage requests must exclude video from the main multipart body');
assert.match(frontend, /uploadKyVideoInChunks\(activityId, videoFile/, 'new KY submit must upload video after record creation');
assert.match(frontend, /uploadKyVideoInChunks\(record\.id, file/, 'follow-up video must use chunk upload');
assert.match(frontend, /uploadKyVideoInChunks\(r\.id, videoFile/, 'Admin video replacement must use chunk upload');
assert.match(frontend, /บันทึกกิจกรรม KY แล้ว แต่วิดีโออัปโหลดไม่สำเร็จ/, 'partial-success guidance must prevent duplicate KY resubmission');

assert.match(main, /ky\.js\?v=20260923-ky-annual-contest-r9/, 'KY page cache key must serve annual compliance, contest, and adaptive chunk upload');
assert.match(html, /main\.js\?v=20260923-fourm-curriculum-soft-disable-r1/, 'SPA cache key must serve the latest KY evidence and adaptive upload bundle');

console.log('KY chunked video upload contract: PASS');
