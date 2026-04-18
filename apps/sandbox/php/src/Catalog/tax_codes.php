<?php
declare(strict_types=1);

/**
 * tax_codes catalog — synthetic.
 */
function tax_codes_catalog(): array
{
    return [
        ['code' => 'IVA-G',   'rate' => 0.16, 'description' => 'General VAT 16%'],
        ['code' => 'IVA-R',   'rate' => 0.08, 'description' => 'Reduced VAT 8%'],
        ['code' => 'IVA-A',   'rate' => 0.31, 'description' => 'Additional VAT 31%'],
        ['code' => 'EXEMPT',  'rate' => 0.00, 'description' => 'Exempt'],
    ];
}
