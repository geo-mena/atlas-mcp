<?php
declare(strict_types=1);

namespace App\Controllers;

require_once __DIR__ . '/../Services/SeniatClient.php';
require_once __DIR__ . '/../Models/Invoice.php';

use App\Services\SeniatClient;
use App\Models\Invoice;

/**
 * InvoiceController — Day 0 skeleton.
 *
 * All actions return 501 with a TODO marker. Day 1 of the build plan
 * implements: form rendering, validation, persistence, SENIAT call,
 * status visualization, error display.
 */
final class InvoiceController
{
    public function showForm(): void
    {
        // TODO Day 1: render src/Views/invoice_form.php with catalogs preloaded.
        http_response_code(501);
        header('Content-Type: text/plain');
        echo "501 Not Implemented — InvoiceController::showForm (Day 1)\n";
    }

    public function submit(): void
    {
        // TODO Day 1: validate $_POST, persist draft Invoice, call SeniatClient::authorize,
        //              update invoice with control_number, redirect to showStatus.
        http_response_code(501);
        header('Content-Type: text/plain');
        echo "501 Not Implemented — InvoiceController::submit (Day 1)\n";
    }

    public function showStatus(int $invoiceId): void
    {
        // TODO Day 1: load Invoice by $invoiceId, render src/Views/invoice_status.php.
        http_response_code(501);
        header('Content-Type: text/plain');
        echo "501 Not Implemented — InvoiceController::showStatus(id={$invoiceId}) (Day 1)\n";
    }
}
