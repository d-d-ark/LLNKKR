<?php
// 해킹은 범죄입니다. LLNKKR 서비스와 API를 악용하지 마세요.
declare(strict_types=1);

require_once __DIR__ . '/lib.php';
ringcl_cors();

$pdo = llnk_db();
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'GET') {
    $retryAfter = llnk_active_block_retry_after($pdo, 'image_lookup', llnk_client_ip());
    if ($retryAfter > 0) {
        header('Retry-After: ' . $retryAfter);
        llnk_fail('비정상적인 이미지 조회가 감지되어 잠시 제한되었습니다.', 429);
    }
    $code = strtolower(trim((string)($_GET['code'] ?? '')));
    if (!preg_match('/^i[a-z0-9]{4}$/', $code)) {
        $retryAfter = llnk_note_image_lookup_miss($pdo, $code);
        if ($retryAfter > 0) {
            header('Retry-After: ' . $retryAfter);
            llnk_fail('비정상적인 이미지 조회가 감지되어 잠시 제한되었습니다.', 429);
        }
        llnk_fail('이미지 코드가 올바르지 않습니다.', 400);
    }
    $stmt = $pdo->prepare(
        "SELECT path_code, target_url, created_at
         FROM llnk_links
         WHERE path_code = ? AND link_type = 'image' AND is_active = 1
         LIMIT 1"
    );
    $stmt->execute([$code]);
    $link = $stmt->fetch();
    if (!$link) {
        $retryAfter = llnk_note_image_lookup_miss($pdo, $code);
        if ($retryAfter > 0) {
            header('Retry-After: ' . $retryAfter);
            llnk_fail('비정상적인 이미지 조회가 감지되어 잠시 제한되었습니다.', 429);
        }
        llnk_fail('이미지를 찾을 수 없습니다.', 404);
    }
    llnk_ok(['image' => [
        'code' => (string)$link['path_code'],
        'url' => (string)$link['target_url'],
        'short_url' => LLNK_BASE_URL . '/' . $link['path_code'],
        'created_at' => (string)$link['created_at'],
    ]]);
}

if ($method !== 'POST') {
    llnk_fail('지원하지 않는 요청입니다.', 405);
}

$input = llnk_json_input();
try {
    $imageUrl = llnk_normalize_image((string)($input['image_url'] ?? ''));
    $ip = llnk_client_ip();
    $dailyLimit = max(1, min(1000, (int)LLNK_EXTENSION_IMAGE_DAILY_LIMIT));
    if (!llnk_daily_quota($pdo, 'extension_image_create_daily', $ip, $dailyLimit)) {
        header('Retry-After: ' . max(1, strtotime('tomorrow') - time()));
        llnk_fail('오늘 만들 수 있는 이미지 링크 수를 모두 사용했습니다.', 429);
    }
    $link = llnk_create_link($pdo, $imageUrl, 'image', ringcl_source_context(), true);
    llnk_ok([
        'code' => substr((string)$link['path_code'], 1),
        'path_code' => $link['path_code'],
        'short_url' => $link['short_url'],
        'image_url' => $imageUrl,
    ]);
} catch (InvalidArgumentException $error) {
    llnk_fail($error->getMessage(), 422);
} catch (Throwable $error) {
    llnk_fail('이미지 링크를 만들지 못했습니다.', 500);
}
