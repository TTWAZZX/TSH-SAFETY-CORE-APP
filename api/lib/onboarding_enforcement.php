<?php
declare(strict_types=1);

function onboarding_canonical_path(string $value): string
{
    $path = trim((string)(parse_url($value, PHP_URL_PATH) ?? ''));
    if ($path === '' || $path[0] !== '/') $path = '/' . $path;
    $path = (string)preg_replace('#/+#', '/', $path);
    $path = (string)preg_replace('#^/api(?=/|$)#i', '', $path);
    if ($path === '') $path = '/';
    if (strlen($path) > 1) $path = rtrim($path, '/');
    return $path;
}

function onboarding_request_key(string $method, string $path): string
{
    return strtoupper($method !== '' ? $method : 'GET') . ' ' . onboarding_canonical_path($path);
}

function onboarding_allowed_requests(string $status): array
{
    if ($status === ONBOARDING_PASSWORD_CHANGE_REQUIRED) {
        return ['POST /change-password', 'POST /session/verify', 'GET /onboarding/status'];
    }
    if ($status === ONBOARDING_SAFETY_UNIT_REQUIRED) {
        return ['POST /change-password', 'POST /session/verify', 'GET /onboarding/status', 'PUT /profile/safety-unit'];
    }
    return [];
}

function onboarding_unavailable_response(): array
{
    return [
        'httpStatus' => 503,
        'payload' => [
            'success' => false,
            'code' => 'ONBOARDING_STATE_UNAVAILABLE',
            'message' => 'Unable to verify onboarding state.',
        ],
    ];
}

function onboarding_block(string $status, string $method, string $path): ?array
{
    if ($status === ONBOARDING_READY) return null;
    if (!in_array($status, [ONBOARDING_PASSWORD_CHANGE_REQUIRED, ONBOARDING_SAFETY_UNIT_REQUIRED], true)) {
        return onboarding_unavailable_response();
    }
    if (in_array(onboarding_request_key($method, $path), onboarding_allowed_requests($status), true)) return null;

    return [
        'httpStatus' => 428,
        'payload' => [
            'success' => false,
            'code' => $status,
            'onboardingStatus' => $status,
            'message' => $status === ONBOARDING_PASSWORD_CHANGE_REQUIRED
                ? 'Password change is required before using the system.'
                : 'Safety Unit selection is required before using the system.',
        ],
    ];
}
