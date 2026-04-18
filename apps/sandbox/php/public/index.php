<?php
declare(strict_types=1);

/**
 * Atlas synthetic eBilling sandbox — front controller.
 *
 * Day 0 skeleton: routes return 501. Real handlers land Day 1.
 *
 * Routing convention mimics CRA8 archetype: country-prefixed paths,
 * monolithic controller dispatch, no framework.
 */

require_once __DIR__ . '/../src/Controllers/InvoiceController.php';

use App\Controllers\InvoiceController;

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri    = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

header('X-Atlas-Sandbox: 1');

// Routing table. Day 1: extract to Router class.
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
    require __DIR__ . '/../src/Catalog/document_types.php';
    header('Content-Type: application/json');
    echo json_encode(document_types_catalog());
    return;
}

http_response_code(404);
header('Content-Type: text/plain');
echo "Not found\n";
