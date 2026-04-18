<?php
/** error.php — Day 0 skeleton. */
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Error — Atlas Sandbox VE</title>
</head>
<body>
  <h1>Error</h1>
  <p><?= htmlspecialchars($_GET['message'] ?? 'Unknown error', ENT_QUOTES, 'UTF-8') ?></p>
</body>
</html>
