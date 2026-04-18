<?php
/**
 * invoice_form.php — bound to controller-loaded $customers, $products,
 * $documentTypes, $currencies.
 */
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>New Invoice — Atlas Sandbox VE</title>
</head>
<body>
  <h1>New Invoice — Venezuela</h1>
  <form method="post" action="/ve/invoice">
    <fieldset>
      <legend>Customer</legend>
      <label for="customer_id">Customer</label>
      <select id="customer_id" name="customer_id" required>
        <option value="">— select —</option>
        <?php foreach ($customers as $c): ?>
          <option value="<?= (int) $c['id'] ?>">
            <?= htmlspecialchars($c['name'] . ' (' . $c['taxpayer_id'] . ')', ENT_QUOTES, 'UTF-8') ?>
          </option>
        <?php endforeach; ?>
      </select>
    </fieldset>

    <fieldset>
      <legend>Line</legend>
      <label for="product_id">Product</label>
      <select id="product_id" name="product_id" required>
        <option value="">— select —</option>
        <?php foreach ($products as $p): ?>
          <option value="<?= (int) $p['id'] ?>">
            <?= htmlspecialchars($p['sku'] . ' — ' . $p['name'] . ' — $' . number_format((float) $p['unit_price'], 2), ENT_QUOTES, 'UTF-8') ?>
          </option>
        <?php endforeach; ?>
      </select>

      <label for="quantity">Quantity</label>
      <input type="number" id="quantity" name="quantity" min="1" value="1" required>

      <label for="currency">Currency</label>
      <select id="currency" name="currency" required>
        <?php foreach ($currencies as $cur): ?>
          <option value="<?= htmlspecialchars($cur['code'], ENT_QUOTES, 'UTF-8') ?>"
                  <?= $cur['is_default'] ? 'selected' : '' ?>>
            <?= htmlspecialchars($cur['code'] . ' — ' . $cur['name'], ENT_QUOTES, 'UTF-8') ?>
          </option>
        <?php endforeach; ?>
      </select>
    </fieldset>

    <fieldset>
      <legend>Document Type</legend>
      <select id="document_type" name="document_type">
        <?php foreach ($documentTypes as $dt): ?>
          <option value="<?= htmlspecialchars($dt['code'], ENT_QUOTES, 'UTF-8') ?>">
            <?= htmlspecialchars($dt['code'] . ' — ' . $dt['name'], ENT_QUOTES, 'UTF-8') ?>
          </option>
        <?php endforeach; ?>
      </select>
    </fieldset>

    <button type="submit">Issue Invoice</button>
  </form>
</body>
</html>
