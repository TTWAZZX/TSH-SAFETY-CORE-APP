'use strict';

const CONTRACT_VERSION = '2026-10-09-safety-vote-phase10.4-r1';
const MEDIA_TYPES = new Set(['link', 'video']);
const SCOPES = new Set(['campaign', 'question', 'option']);

function clean(value, max = 1000) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function canonicalMedia(input = {}) {
  const mediaType = clean(input.mediaType, 16).toLowerCase();
  const scopeType = clean(input.scopeType, 16).toLowerCase();
  const title = clean(input.title, 200);
  const questionCode = clean(input.questionCode, 60).toUpperCase();
  const optionCode = clean(input.optionCode, 60).toUpperCase();
  const raw = clean(input.url, 1000);
  if (!MEDIA_TYPES.has(mediaType) || !SCOPES.has(scopeType)) throw Object.assign(new Error('Unsupported media type or scope.'), { code: 'MEDIA_TYPE_INVALID' });
  if (scopeType === 'question' && !questionCode) throw Object.assign(new Error('Question media requires questionCode.'), { code: 'MEDIA_SCOPE_INVALID' });
  if (scopeType === 'option' && (!questionCode || !optionCode)) throw Object.assign(new Error('Option media requires questionCode and optionCode.'), { code: 'MEDIA_SCOPE_INVALID' });
  let url;
  try { url = new URL(raw); } catch { throw Object.assign(new Error('Media URL is invalid.'), { code: 'MEDIA_URL_INVALID' }); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw Object.assign(new Error('Only credential-free HTTPS media URLs are allowed.'), { code: 'MEDIA_URL_INVALID' });
  url.hash = '';
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let provider = 'external', embedUrl = null;
  if (mediaType === 'video') {
    let videoId = '';
    if (host === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] || '';
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') videoId = url.searchParams.get('v') || '';
      else videoId = url.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})/)?.[1] || '';
    }
    if (/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      provider = 'youtube'; embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
    } else if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      videoId = url.pathname.match(/(?:\/video)?\/(\d{6,12})(?:\/|$)/)?.[1] || '';
      if (videoId) { provider = 'vimeo'; embedUrl = `https://player.vimeo.com/video/${videoId}`; }
    }
    if (!embedUrl) throw Object.assign(new Error('Video must use an approved YouTube or Vimeo HTTPS URL.'), { code: 'VIDEO_PROVIDER_NOT_ALLOWED' });
  }
  return { mediaType, scopeType, questionCode: questionCode || null, optionCode: optionCode || null, title: title || null, url: url.toString(), provider, embedUrl };
}

function normalizeMedia(items) {
  if (!Array.isArray(items) || items.length > 100) return { ok: false, errors: [{ code: 'MEDIA_LIST_INVALID' }] };
  const errors = [], rows = [], seen = new Set();
  items.forEach((item, index) => {
    try {
      const row = canonicalMedia(item), key = [row.scopeType, row.questionCode, row.optionCode, row.mediaType].join('|');
      if (seen.has(key)) throw Object.assign(new Error('Only one media item of each type is allowed per scope.'), { code: 'MEDIA_DUPLICATE' });
      seen.add(key); rows.push({ ...row, sortOrder: index + 1 });
    } catch (error) { errors.push({ index, code: error.code || 'MEDIA_INVALID', message: error.message }); }
  });
  return errors.length ? { ok: false, errors } : { ok: true, items: rows };
}

function editPolicy(campaignStatus, currentVersionId, versionId) {
  const live = Number(currentVersionId) === Number(versionId);
  const open = campaignStatus === 'Open';
  return {
    campaignStatus, live,
    directEditAllowed: campaignStatus === 'Draft' && live,
    revisionEditAllowed: !live,
    createRevisionAllowed: !['Voided', 'Archived'].includes(campaignStatus),
    activateRevisionAllowed: !open && !['Voided', 'Archived'].includes(campaignStatus),
    policyCode: open ? 'LIVE_CONTENT_IMMUTABLE_PREPARE_REVISION' : (live ? 'DRAFT_DIRECT_EDIT' : 'OFFLINE_REVISION_EDIT'),
    protectedWhileOpen: ['questions', 'options', 'media', 'privacyMode', 'eligibility', 'schedule', 'scoring'],
    safeOperationalMetadata: [],
  };
}

module.exports = { CONTRACT_VERSION, canonicalMedia, normalizeMedia, editPolicy };
