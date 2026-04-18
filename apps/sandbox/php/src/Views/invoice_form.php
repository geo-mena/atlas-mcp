<?php
/**
 * invoice_form.php — Day 0 skeleton form.
 *
 * Day 1: bind catalogs, validation messages, CSRF token.
 * Field names below intentionally mirror CRA8-archetype eBilling.
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
        <!-- TODO Day 1: populate from customers table -->
      </select>
    </fieldset>

    <fieldset>
      <legend>Lines</legend>
      <label for="document_type">Document Type</label>
      <select id="document_type" name="document_type" required>
        <option value="">— select —</option>
        <!-- TODO Day 1: populate from document_types catalog -->
      </select>

      <label for="currency">Currency</label>
      <select id="currency" name="currency" required>
        <option value="USD">USD</option>
        <option value="VES">VES</option>
      </select>

      <label for="amount">Amount</label>
      <input type="number" id="amount" name="amount" step="0.01" min="0.01" required>
    </fieldset>

    <button type="submit">Issue Invoice</button>
  </form>
</body>
</html>
