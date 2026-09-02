<?php
declare(strict_types=1);

function bbs_list_query(array $query, int $defaultPageSize = 20, int $maxPageSize = 100): array
{
    $page = max(1, (int) ($query['page'] ?? 1));
    $pageSize = max(1, (int) ($query['pageSize'] ?? $defaultPageSize));
    $pageSize = min($pageSize, $maxPageSize);
    return ['paged' => (string) ($query['paged'] ?? '') === '1', 'page' => $page, 'pageSize' => $pageSize, 'offset' => ($page - 1) * $pageSize];
}

function bbs_list_pagination(int $total, int $page, int $pageSize): array
{
    $total = max(0, $total);
    $totalPages = max(1, (int) ceil($total / $pageSize));
    $page = min(max(1, $page), $totalPages);
    return ['page' => $page, 'pageSize' => $pageSize, 'total' => $total, 'totalPages' => $totalPages, 'hasPrevious' => $page > 1, 'hasNext' => $page < $totalPages];
}

function bbs_list_search($value, int $maxLength = 120): string
{
    return mb_substr(trim((string) $value), 0, $maxLength);
}
