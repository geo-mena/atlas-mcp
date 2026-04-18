<?php
declare(strict_types=1);

namespace App\Models;

/**
 * Customer — POPO model. Day 0 skeleton.
 */
final class Customer
{
    public ?int $id = null;
    public string $name = '';
    public string $taxpayer_id = ''; // synthetic format, no real RIF
    public string $email = '';
    public string $created_at = '';
}
