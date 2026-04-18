<?php
declare(strict_types=1);

/**
 * currencies catalog — synthetic.
 */
function currencies_catalog(): array
{
    return [
        ['code' => 'USD', 'name' => 'US Dollar',         'is_default' => true],
        ['code' => 'VES', 'name' => 'Venezuelan Bolívar', 'is_default' => false],
        ['code' => 'EUR', 'name' => 'Euro',              'is_default' => false],
    ];
}
