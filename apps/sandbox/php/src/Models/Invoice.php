<?php
declare(strict_types=1);

namespace App\Models;

/**
 * Invoice — POPO model. Day 0 skeleton.
 *
 * Mirrors the columns in db/schema.sql.
 */
final class Invoice
{
    public ?int $id = null;
    public int $customer_id = 0;
    public string $status = 'draft'; // enum: draft | authorized | rejected
    public ?string $control_number = null;
    public ?string $fiscal_sequence = null;
    public string $currency = 'USD';
    public string $created_at = '';
    public ?string $authorized_at = null;
}
