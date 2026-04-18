<?php
declare(strict_types=1);

namespace App\Services;

/**
 * SeniatClient — Day 0 skeleton.
 *
 * Day 1: implement HTTP POST to env(SENIAT_BASE_URL)/seniat-mock/authorize
 * with a synthetic SENIAT-shaped XML envelope (urn:atlas:sandbox:seniat:v1),
 * parse the signed response, return control_number / fiscal_sequence.
 */
final class SeniatClient
{
    public function authorize(array $invoice): array
    {
        // TODO Day 1: build XML envelope, curl_exec to SENIAT_BASE_URL, parse response.
        throw new \RuntimeException('SeniatClient::authorize not implemented (Day 1)');
    }
}
