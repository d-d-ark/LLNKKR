<?php
// 해킹은 범죄입니다. LLNKKR 서비스와 API를 악용하지 마세요.
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/llnk_lib.php';

function ringcl_cors(): void
{
    $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    $isPlayentry = $origin === 'https://playentry.org';
    $isChromeExtension = preg_match('/^chrome-extension:\/\/[a-p]{32}$/', $origin) === 1;
    if (!$isPlayentry && !$isChromeExtension) {
        llnk_fail('허용되지 않은 요청 출처입니다.', 403);
    }
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Headers: Content-Type, X-LLNKKR-Version');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Vary: Origin');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'OPTIONS') {
        llnk_set_status(204);
        exit;
    }
}

function ringcl_header(string $name): string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return trim((string)($_SERVER[$key] ?? ''));
}

function ringcl_source_context(): array
{
    return [
        'extension_version' => llnk_clip(ringcl_header('X-LLNKKR-Version'), 20),
    ];
}
