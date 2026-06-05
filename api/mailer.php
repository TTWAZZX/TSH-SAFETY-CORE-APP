<?php
declare(strict_types=1);

function mailer_smtp_configured(): bool
{
    global $config;
    return trim((string)($config['smtp_host'] ?? '')) !== '';
}

function mailer_recipients($value): array
{
    return array_values(array_filter(array_map(static function ($item) {
        $item = trim((string)$item);
        return filter_var($item, FILTER_VALIDATE_EMAIL) ? $item : '';
    }, preg_split('/[,;]+/', (string)$value) ?: [])));
}

function mailer_strip_address(string $value): string
{
    return trim(str_replace(["\r", "\n", '<', '>'], '', $value));
}

function mailer_header(string $value): string
{
    $value = trim(str_replace(["\r", "\n"], ' ', $value));
    if (preg_match('/^[\x00-\x7F]*$/', $value)) {
        return $value;
    }
    $parts = [];
    $length = strlen($value);
    for ($i = 0; $i < $length; $i += 42) {
        $chunk = function_exists('mb_strcut') ? mb_strcut($value, $i, 42, 'UTF-8') : substr($value, $i, 42);
        $parts[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
    }
    return implode("\r\n ", $parts);
}

function mailer_address_header(string $email, string $name = ''): string
{
    $email = mailer_strip_address($email);
    $name = trim(str_replace(["\r", "\n", '<', '>'], ' ', $name));
    if ($name === '') {
        return '<' . $email . '>';
    }
    if (preg_match('/^[\x20-\x7E]*$/', $name)) {
        $name = '"' . addcslashes($name, '\\"') . '"';
    } else {
        $name = mailer_header($name);
    }
    return $name . ' <' . $email . '>';
}

function mailer_b64_lines(string $value): string
{
    return rtrim(chunk_split(base64_encode(mailer_normalize_crlf($value)), 76, "\r\n"));
}

function mailer_normalize_crlf(string $value): string
{
    return (string) preg_replace("/\r\n|\r|\n/", "\r\n", $value);
}

function mailer_text_part(string $text): string
{
    return "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . mailer_b64_lines($text);
}

function mailer_html_part(string $html): string
{
    return "Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . mailer_b64_lines($html);
}

function mailer_build_message(string $from, string $fromName, array $to, string $subject, string $text, ?string $html): string
{
    $boundary = 'tsh-safety-core-' . time() . '-' . bin2hex(random_bytes(6));
    $fromHeader = mailer_address_header($from, $fromName);
    $headers = [
        'From: ' . $fromHeader,
        'To: ' . implode(', ', $to),
        'Subject: ' . mailer_header($subject),
        'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
        'Message-ID: <' . time() . '.' . bin2hex(random_bytes(6)) . '@tsh-safety-core>',
        'MIME-Version: 1.0',
    ];

    if (trim((string)$html) !== '') {
        $headers[] = 'Content-Type: multipart/alternative; boundary="' . $boundary . '"';
        $body = "--{$boundary}\r\n" . mailer_text_part($text)
            . "\r\n--{$boundary}\r\n" . mailer_html_part((string)$html)
            . "\r\n--{$boundary}--";
    } else {
        $body = mailer_text_part($text);
    }

    return implode("\r\n", $headers) . "\r\n\r\n" . $body;
}

function mailer_read_response($socket): array
{
    $lines = [];
    while (($line = fgets($socket, 515)) !== false) {
        $line = rtrim($line, "\r\n");
        $lines[] = $line;
        if (preg_match('/^\d{3} /', $line)) {
            return [(int)substr($line, 0, 3), $lines];
        }
    }
    throw new RuntimeException('SMTP connection closed unexpectedly');
}

function mailer_expect($socket, $expected): array
{
    [$code, $lines] = mailer_read_response($socket);
    $accepted = is_array($expected) ? $expected : [$expected];
    foreach ($accepted as $prefix) {
        if (strpos((string)$code, (string)$prefix) === 0) {
            return [$code, $lines];
        }
    }
    throw new RuntimeException('SMTP ' . $code . ': ' . implode(' | ', $lines));
}

function mailer_send_line($socket, string $line, $expected = 250): array
{
    fwrite($socket, $line . "\r\n");
    return mailer_expect($socket, $expected);
}

function mailer_dot_stuff(string $message): string
{
    return (string) preg_replace('/^\./m', '..', mailer_normalize_crlf($message));
}

function mailer_send_mail($to, string $subject, ?string $text, ?string $html = null): array
{
    global $config;
    if (!mailer_smtp_configured()) {
        return ['skipped' => true, 'reason' => 'SMTP_HOST is not configured'];
    }

    $host = (string)$config['smtp_host'];
    $port = (int)($config['smtp_port'] ?: (($config['smtp_secure'] ?? false) ? 465 : 587));
    $timeout = max(1, ((int)($config['smtp_timeout'] ?? 15000)) / 1000);
    $secure = !empty($config['smtp_secure']);
    $transport = ($secure ? 'ssl://' : '') . $host . ':' . $port;
    $errno = 0;
    $errstr = '';
    $socket = @stream_socket_client($transport, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT);
    if (!$socket) {
        throw new RuntimeException('SMTP connect failed: ' . ($errstr ?: $errno));
    }
    stream_set_timeout($socket, (int)ceil($timeout));

    try {
        mailer_expect($socket, 220);
        mailer_send_line($socket, 'EHLO ' . ($config['smtp_ehlo_domain'] ?? 'localhost'), 250);

        if (!$secure && !empty($config['smtp_starttls'])) {
            mailer_send_line($socket, 'STARTTLS', 220);
            $method = defined('STREAM_CRYPTO_METHOD_TLS_CLIENT') ? STREAM_CRYPTO_METHOD_TLS_CLIENT : STREAM_CRYPTO_METHOD_SSLv23_CLIENT;
            if (!stream_socket_enable_crypto($socket, true, $method)) {
                throw new RuntimeException('SMTP STARTTLS upgrade failed');
            }
            mailer_send_line($socket, 'EHLO ' . ($config['smtp_ehlo_domain'] ?? 'localhost'), 250);
        }

        if (trim((string)($config['smtp_user'] ?? '')) !== '') {
            mailer_send_line($socket, 'AUTH LOGIN', 334);
            mailer_send_line($socket, base64_encode((string)$config['smtp_user']), 334);
            mailer_send_line($socket, base64_encode((string)($config['smtp_pass'] ?? '')), 235);
        }

        $from = mailer_strip_address((string)($config['smtp_from'] ?: ($config['smtp_user'] ?? 'noreply@localhost')));
        $recipients = mailer_recipients($to);
        if (!$recipients) {
            return ['skipped' => true, 'reason' => 'No valid recipient'];
        }

        mailer_send_line($socket, 'MAIL FROM:<' . $from . '>', 250);
        foreach ($recipients as $recipient) {
            mailer_send_line($socket, 'RCPT TO:<' . mailer_strip_address($recipient) . '>', [250, 251]);
        }
        mailer_send_line($socket, 'DATA', 354);
        $message = mailer_build_message($from, (string)($config['smtp_from_name'] ?? 'TSH Safety Core'), $recipients, $subject, (string)$text, $html);
        fwrite($socket, mailer_dot_stuff($message) . "\r\n.\r\n");
        mailer_expect($socket, 250);
        mailer_send_line($socket, 'QUIT', 221);
        fclose($socket);
        return ['sent' => true, 'recipients' => count($recipients)];
    } catch (Throwable $e) {
        if (is_resource($socket)) {
            fclose($socket);
        }
        throw $e;
    }
}

function mailer_validate_identifier(string $name): string
{
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $name)) {
        throw new InvalidArgumentException('Invalid identifier');
    }
    return $name;
}

function mailer_outbox_send(string $table, int $id, string $recipientColumn = 'Recipients', ?string $htmlColumn = 'HtmlBody'): array
{
    $table = mailer_validate_identifier($table);
    $recipientColumn = mailer_validate_identifier($recipientColumn);
    $select = 'id,' . $recipientColumn . ' AS MailRecipients,Subject,Body';
    if ($htmlColumn !== null) {
        $htmlColumn = mailer_validate_identifier($htmlColumn);
        $select .= ',' . $htmlColumn . ' AS MailHtml';
    } else {
        $select .= ',NULL AS MailHtml';
    }

    $item = db_row("SELECT {$select} FROM {$table} WHERE id=? LIMIT 1", [$id]);
    if (!$item) {
        json_response(['success' => false, 'message' => 'Email queue item not found.'], 404);
    }
    if (!mailer_smtp_configured()) {
        json_response(['success' => false, 'message' => 'SMTP is not configured.'], 400);
    }

    try {
        $result = mailer_send_mail($item['MailRecipients'] ?? '', (string)($item['Subject'] ?? ''), (string)($item['Body'] ?? ''), $item['MailHtml'] ?? null);
        if (!empty($result['skipped'])) {
            db_execute("UPDATE {$table} SET Status='Queued', Error=? WHERE id=?", [$result['reason'] ?? 'Skipped', $id]);
            return ['status' => 'Skipped', 'error' => $result['reason'] ?? 'Skipped'];
        }
        db_execute("UPDATE {$table} SET Status='Sent', SentAt=NOW(), Error=NULL WHERE id=?", [$id]);
        return ['status' => 'Sent'];
    } catch (Throwable $e) {
        db_execute("UPDATE {$table} SET Status='Failed', Error=? WHERE id=?", [mb_substr($e->getMessage(), 0, 2000), $id]);
        throw $e;
    }
}

function mailer_outbox_retry_queued(string $table, string $recipientColumn = 'Recipients', ?string $htmlColumn = 'HtmlBody', int $limit = 20): array
{
    $table = mailer_validate_identifier($table);
    $limit = min(max($limit, 1), 50);
    $rows = db_rows("SELECT id FROM {$table} WHERE Status IN ('Queued','Failed') ORDER BY CreatedAt ASC,id ASC LIMIT {$limit}");
    $results = [];
    $sent = 0;
    $failed = 0;
    foreach ($rows as $row) {
        $id = (int)($row['id'] ?? 0);
        try {
            $result = mailer_outbox_send($table, $id, $recipientColumn, $htmlColumn);
            $status = $result['status'] ?? 'Sent';
            if ($status === 'Sent') {
                $sent++;
            }
            $results[] = ['id' => $id, 'status' => $status];
        } catch (Throwable $e) {
            $failed++;
            $results[] = ['id' => $id, 'status' => 'Failed', 'error' => $e->getMessage()];
        }
    }
    return ['processed' => count($rows), 'sent' => $sent, 'failed' => $failed, 'results' => $results];
}

function mailer_outbox_best_effort(string $table, int $id, string $recipientColumn = 'Recipients', ?string $htmlColumn = 'HtmlBody'): void
{
    if (!mailer_smtp_configured() || $id <= 0) {
        return;
    }
    try {
        mailer_outbox_send($table, $id, $recipientColumn, $htmlColumn);
    } catch (Throwable $e) {
        // Workflows must not fail just because notification delivery failed.
    }
}
