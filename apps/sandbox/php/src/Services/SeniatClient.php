<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\Invoice;
use RuntimeException;

require_once __DIR__ . '/../Models/Invoice.php';

/**
 * SeniatClient — POST a synthetic SENIAT-shaped XML envelope to the mock
 * service and parse the response. Sandbox-only. NOT a real SENIAT integration.
 */
final class SeniatClient
{
    private const NAMESPACE = 'urn:atlas:sandbox:seniat:v1';
    private const TIMEOUT_SECONDS = 10;

    public function authorize(Invoice $invoice, array $lines, string $taxpayerId): array
    {
        $envelope = $this->buildEnvelope($invoice, $lines, $taxpayerId);
        [$status, $body] = $this->postXml($this->endpoint(), $envelope);

        if ($status >= 500) {
            throw new RuntimeException("SENIAT mock {$status}: upstream unavailable");
        }

        $parsed = $this->parseEnvelope($body);

        if ($status === 400 || isset($parsed['error_code'])) {
            $message = $parsed['error_message'] ?? 'unknown error';
            throw new RuntimeException("SENIAT rejected: {$parsed['error_code']} — {$message}");
        }

        if ($status !== 200) {
            throw new RuntimeException("SENIAT unexpected {$status}");
        }

        return [
            'control_number'  => $parsed['control_number'] ?? null,
            'fiscal_sequence' => $parsed['fiscal_sequence'] ?? null,
            'request_body'    => $envelope,
            'response_body'   => $body,
            'http_status'     => $status,
        ];
    }

    private function endpoint(): string
    {
        $base = getenv('SENIAT_BASE_URL') ?: 'http://localhost:8081';
        return rtrim($base, '/') . '/seniat-mock/authorize';
    }

    private function buildEnvelope(Invoice $invoice, array $lines, string $taxpayerId): string
    {
        $linesXml = '';
        foreach ($lines as $line) {
            $linesXml .= sprintf(
                '<Line><Sku>%s</Sku><Quantity>%d</Quantity><UnitPrice>%.2f</UnitPrice><TaxCode>%s</TaxCode></Line>',
                htmlspecialchars((string) $line['sku'], ENT_XML1),
                (int) $line['quantity'],
                (float) $line['unit_price'],
                htmlspecialchars((string) $line['tax_code'], ENT_XML1),
            );
        }

        return sprintf(
            '<?xml version="1.0" encoding="UTF-8"?>'
            . '<AuthorizationRequest xmlns="%s">'
            .   '<Issuer><TaxpayerId>%s</TaxpayerId></Issuer>'
            .   '<Invoice><Currency>%s</Currency><TotalAmount>%.2f</TotalAmount>%s</Invoice>'
            . '</AuthorizationRequest>',
            self::NAMESPACE,
            htmlspecialchars($taxpayerId, ENT_XML1),
            htmlspecialchars($invoice->currency, ENT_XML1),
            $invoice->total_amount ?? 0.0,
            $linesXml,
        );
    }

    private function parseEnvelope(string $xml): array
    {
        $doc = @simplexml_load_string($xml);
        if ($doc === false) {
            return ['error_code' => 'PARSE_ERROR', 'error_message' => 'response is not valid XML'];
        }
        $doc->registerXPathNamespace('a', self::NAMESPACE);

        $error = $doc->xpath('//a:error');
        if (!empty($error)) {
            return [
                'error_code'    => (string) $error[0]->code,
                'error_message' => (string) $error[0]->message,
            ];
        }

        $auth = $doc->xpath('//a:authorization');
        if (empty($auth)) {
            return ['error_code' => 'PARSE_ERROR', 'error_message' => 'no authorization element'];
        }
        return [
            'control_number'  => (string) $auth[0]->control_number,
            'fiscal_sequence' => (string) $auth[0]->fiscal_sequence,
        ];
    }

    private function postXml(string $url, string $body): array
    {
        // PHP 8+ closes the cURL handle on garbage collection; explicit
        // curl_close is deprecated.
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST            => true,
            CURLOPT_POSTFIELDS      => $body,
            CURLOPT_HTTPHEADER      => ['Content-Type: application/xml'],
            CURLOPT_RETURNTRANSFER  => true,
            CURLOPT_TIMEOUT         => self::TIMEOUT_SECONDS,
            CURLOPT_CONNECTTIMEOUT  => 5,
        ]);

        $response = curl_exec($ch);
        if ($response === false) {
            throw new RuntimeException('SENIAT mock unreachable: ' . curl_error($ch));
        }
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

        return [$status, (string) $response];
    }
}
