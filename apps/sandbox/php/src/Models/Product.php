<?php
declare(strict_types=1);

namespace App\Models;

/**
 * Product — POPO model. Day 0 skeleton.
 */
final class Product
{
    public ?int $id = null;
    public string $sku = '';
    public string $name = '';
    public string $tax_code = '';
    public float $unit_price = 0.0;
    public string $currency = 'USD';
}
