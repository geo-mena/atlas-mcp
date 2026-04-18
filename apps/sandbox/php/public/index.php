<?php
declare(strict_types=1);

/**
 * Atlas synthetic eBilling sandbox — front controller.
 *
 * Country-prefixed routes mimic the CRA8 archetype. No framework: handlers
 * are dispatched via a flat switch so reverse-engineering tools can extract
 * routes from a single file.
 */

require_once __DIR__ . '/../src/Controllers/InvoiceController.php';
require_once __DIR__ . '/../src/Catalog/document_types.php';
require_once __DIR__ . '/../src/Catalog/tax_codes.php';
require_once __DIR__ . '/../src/Catalog/currencies.php';

use App\Controllers\InvoiceController;

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri    = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

header('X-Atlas-Sandbox: 1');

if ($method === 'GET' && $uri === '/ve/invoice') {
    (new InvoiceController())->showForm();
    return;
}
if ($method === 'POST' && $uri === '/ve/invoice') {
    (new InvoiceController())->submit();
    return;
}
if ($method === 'GET' && preg_match('#^/ve/invoice/(\d+)$#', $uri, $m)) {
    (new InvoiceController())->showStatus((int) $m[1]);
    return;
}

if ($method === 'GET' && $uri === '/ve/catalog/document-types') {
    header('Content-Type: application/json');
    echo json_encode(document_types_catalog());
    return;
}
if ($method === 'GET' && $uri === '/ve/catalog/tax-codes') {
    header('Content-Type: application/json');
    echo json_encode(tax_codes_catalog());
    return;
}
if ($method === 'GET' && $uri === '/ve/catalog/currencies') {
    header('Content-Type: application/json');
    echo json_encode(currencies_catalog());
    return;
}

if ($method === 'GET' && $uri === '/health') {
    header('Content-Type: application/json');
    echo json_encode(['status' => 'ok']);
    return;
}

http_response_code(404);
header('Content-Type: text/plain');
echo "Not found\n";
