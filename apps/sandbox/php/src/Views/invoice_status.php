<?php
/**
 * invoice_status.php — bound to controller-loaded $invoice, $lines, $response.
 */
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Invoice <?= (int) $invoice['id'] ?> — Atlas Sandbox VE</title>
</head>
<body>
  <h1>Invoice #<?= (int) $invoice['id'] ?></h1>

  <dl>
    <dt>Status</dt>
    <dd><?= htmlspecialchars((string) $invoice['status'], ENT_QUOTES, 'UTF-8') ?></dd>

    <dt>Control Number</dt>
    <dd><?= htmlspecialchars((string) ($invoice['control_number'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>

    <dt>Fiscal Sequence</dt>
    <dd><?= htmlspecialchars((string) ($invoice['fiscal_sequence'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>

    <dt>Currency</dt>
    <dd><?= htmlspecialchars((string) $invoice['currency'], ENT_QUOTES, 'UTF-8') ?></dd>

    <dt>Total</dt>
    <dd><?= number_format((float) $invoice['total_amount'], 2) ?></dd>

    <dt>Authorized at</dt>
    <dd><?= htmlspecialchars((string) ($invoice['authorized_at'] ?? '—'), ENT_QUOTES, 'UTF-8') ?></dd>
  </dl>

  <h2>Lines</h2>
  <table>
    <thead><tr><th>SKU</th><th>Name</th><th>Qty</th><th>Unit price</th><th>Tax code</th></tr></thead>
    <tbody>
      <?php foreach ($lines as $line): ?>
        <tr>
          <td><?= htmlspecialchars((string) $line['sku'], ENT_QUOTES, 'UTF-8') ?></td>
          <td><?= htmlspecialchars((string) $line['name'], ENT_QUOTES, 'UTF-8') ?></td>
          <td><?= (int) $line['quantity'] ?></td>
          <td><?= number_format((float) $line['unit_price'], 2) ?></td>
          <td><?= htmlspecialchars((string) $line['tax_code'], ENT_QUOTES, 'UTF-8') ?></td>
        </tr>
      <?php endforeach; ?>
    </tbody>
  </table>

  <?php if ($response !== null): ?>
    <h2>Last SENIAT response</h2>
    <p>HTTP <?= (int) $response['http_status'] ?> at <?= htmlspecialchars((string) $response['created_at'], ENT_QUOTES, 'UTF-8') ?></p>
    <details>
      <summary>Request</summary>
      <pre><?= htmlspecialchars((string) $response['request_body'], ENT_QUOTES, 'UTF-8') ?></pre>
    </details>
    <details>
      <summary>Response</summary>
      <pre><?= htmlspecialchars((string) $response['response_body'], ENT_QUOTES, 'UTF-8') ?></pre>
    </details>
  <?php endif; ?>

  <p><a href="/ve/invoice">← New invoice</a></p>
</body>
</html>
