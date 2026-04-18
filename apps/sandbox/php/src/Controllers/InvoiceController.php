<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Db;
use App\Models\Invoice;
use App\Services\SeniatClient;
use PDO;
use PDOException;
use RuntimeException;
use Throwable;

require_once __DIR__ . '/../Db.php';
require_once __DIR__ . '/../Services/SeniatClient.php';
require_once __DIR__ . '/../Models/Invoice.php';
require_once __DIR__ . '/../Catalog/document_types.php';
require_once __DIR__ . '/../Catalog/tax_codes.php';
require_once __DIR__ . '/../Catalog/currencies.php';

final class InvoiceController
{
    public function showForm(): void
    {
        $customers     = $this->loadCustomers();
        $products      = $this->loadProducts();
        $documentTypes = document_types_catalog();
        $currencies    = currencies_catalog();

        require __DIR__ . '/../Views/invoice_form.php';
    }

    public function submit(): void
    {
        try {
            $invoiceId = $this->persistAndAuthorize($_POST);
        } catch (Throwable $e) {
            http_response_code(422);
            $message = $e->getMessage();
            require __DIR__ . '/../Views/error.php';
            return;
        }

        header("Location: /ve/invoice/{$invoiceId}", true, 302);
    }

    public function showStatus(int $invoiceId): void
    {
        $invoice  = $this->loadInvoice($invoiceId);
        $lines    = $this->loadLines($invoiceId);
        $response = $this->loadLastSeniatResponse($invoiceId);

        if ($invoice === null) {
            http_response_code(404);
            $message = "Invoice {$invoiceId} not found";
            require __DIR__ . '/../Views/error.php';
            return;
        }

        require __DIR__ . '/../Views/invoice_status.php';
    }

    private function persistAndAuthorize(array $post): int
    {
        $customerId = $this->requireInt($post, 'customer_id');
        $productId  = $this->requireInt($post, 'product_id');
        $quantity   = $this->requireInt($post, 'quantity');
        $currency   = $this->requireString($post, 'currency');

        if ($quantity < 1) {
            throw new RuntimeException('quantity must be ≥ 1');
        }

        $pdo = Db::pdo();
        $product  = $this->loadProduct($productId);
        $customer = $this->loadCustomer($customerId);
        if ($product === null || $customer === null) {
            throw new RuntimeException('unknown customer or product');
        }

        $unitPrice = (float) $product['unit_price'];
        $taxCode   = (string) $product['tax_code'];
        $total     = $unitPrice * $quantity;

        $pdo->beginTransaction();
        try {
            $invoiceId = $this->insertDraftInvoice($pdo, $customerId, $currency, $total);
            $this->insertLine($pdo, $invoiceId, $productId, $quantity, $unitPrice, $taxCode);

            $invoice = new Invoice();
            $invoice->id           = $invoiceId;
            $invoice->customer_id  = $customerId;
            $invoice->currency     = $currency;
            $invoice->total_amount = $total;

            $authorization = (new SeniatClient())->authorize(
                $invoice,
                [['sku' => $product['sku'], 'quantity' => $quantity, 'unit_price' => $unitPrice, 'tax_code' => $taxCode]],
                (string) $customer['taxpayer_id'],
            );

            $this->logSeniatResponse($pdo, $invoiceId, $authorization);
            $this->markAuthorized($pdo, $invoiceId, $authorization);

            $pdo->commit();
            return $invoiceId;
        } catch (Throwable $e) {
            $pdo->rollBack();
            $this->markRejectedBestEffort($invoiceId ?? 0, $e->getMessage());
            throw $e;
        }
    }

    private function insertDraftInvoice(PDO $pdo, int $customerId, string $currency, float $total): int
    {
        $stmt = $pdo->prepare(
            'INSERT INTO invoices (customer_id, status, currency, total_amount) VALUES (:c, "draft", :cur, :t)'
        );
        $stmt->execute([':c' => $customerId, ':cur' => $currency, ':t' => $total]);
        return (int) $pdo->lastInsertId();
    }

    private function insertLine(PDO $pdo, int $invoiceId, int $productId, int $qty, float $unitPrice, string $taxCode): void
    {
        $stmt = $pdo->prepare(
            'INSERT INTO invoice_lines (invoice_id, product_id, quantity, unit_price, tax_code) VALUES (:i, :p, :q, :u, :t)'
        );
        $stmt->execute([':i' => $invoiceId, ':p' => $productId, ':q' => $qty, ':u' => $unitPrice, ':t' => $taxCode]);
    }

    private function logSeniatResponse(PDO $pdo, int $invoiceId, array $authorization): void
    {
        $stmt = $pdo->prepare(
            'INSERT INTO seniat_responses (invoice_id, http_status, request_body, response_body) VALUES (:i, :s, :req, :res)'
        );
        $stmt->execute([
            ':i'   => $invoiceId,
            ':s'   => $authorization['http_status'],
            ':req' => $authorization['request_body'],
            ':res' => $authorization['response_body'],
        ]);
    }

    private function markAuthorized(PDO $pdo, int $invoiceId, array $authorization): void
    {
        $stmt = $pdo->prepare(
            'UPDATE invoices SET status = "authorized", control_number = :cn, fiscal_sequence = :fs, authorized_at = NOW() WHERE id = :id'
        );
        $stmt->execute([
            ':cn' => $authorization['control_number'],
            ':fs' => $authorization['fiscal_sequence'],
            ':id' => $invoiceId,
        ]);
    }

    private function markRejectedBestEffort(int $invoiceId, string $reason): void
    {
        if ($invoiceId === 0) return;
        try {
            $pdo = Db::pdo();
            $stmt = $pdo->prepare('UPDATE invoices SET status = "rejected" WHERE id = :id');
            $stmt->execute([':id' => $invoiceId]);
            // Reason is stored in seniat_responses if present; otherwise audit_log.
            $audit = $pdo->prepare('INSERT INTO audit_log (actor, action, payload) VALUES ("controller", "invoice_rejected", :p)');
            $audit->execute([':p' => json_encode(['invoice_id' => $invoiceId, 'reason' => $reason])]);
        } catch (PDOException) {
            // Sandbox; swallow secondary failures so the original error reaches the user.
        }
    }

    private function loadCustomers(): array
    {
        return Db::pdo()->query('SELECT id, name, taxpayer_id FROM customers ORDER BY id')->fetchAll();
    }

    private function loadProducts(): array
    {
        return Db::pdo()->query('SELECT id, sku, name, tax_code, unit_price, currency FROM products ORDER BY id')->fetchAll();
    }

    private function loadCustomer(int $id): ?array
    {
        $stmt = Db::pdo()->prepare('SELECT id, name, taxpayer_id FROM customers WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    private function loadProduct(int $id): ?array
    {
        $stmt = Db::pdo()->prepare('SELECT id, sku, name, tax_code, unit_price, currency FROM products WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    private function loadInvoice(int $id): ?array
    {
        $stmt = Db::pdo()->prepare('SELECT * FROM invoices WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    private function loadLines(int $invoiceId): array
    {
        $stmt = Db::pdo()->prepare(
            'SELECT il.*, p.sku, p.name FROM invoice_lines il JOIN products p ON p.id = il.product_id WHERE il.invoice_id = :i'
        );
        $stmt->execute([':i' => $invoiceId]);
        return $stmt->fetchAll();
    }

    private function loadLastSeniatResponse(int $invoiceId): ?array
    {
        $stmt = Db::pdo()->prepare('SELECT * FROM seniat_responses WHERE invoice_id = :i ORDER BY id DESC LIMIT 1');
        $stmt->execute([':i' => $invoiceId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    private function requireInt(array $source, string $key): int
    {
        if (!isset($source[$key]) || !is_numeric($source[$key])) {
            throw new RuntimeException("missing or invalid {$key}");
        }
        return (int) $source[$key];
    }

    private function requireString(array $source, string $key): string
    {
        if (!isset($source[$key]) || !is_string($source[$key]) || $source[$key] === '') {
            throw new RuntimeException("missing or invalid {$key}");
        }
        return $source[$key];
    }
}
