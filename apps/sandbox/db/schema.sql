-- Atlas synthetic eBilling sandbox schema. NOT real SENIAT, NOT real DHL.

CREATE TABLE IF NOT EXISTS customers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  taxpayer_id   VARCHAR(64)  NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  sku           VARCHAR(64)  NOT NULL UNIQUE,
  name          VARCHAR(255) NOT NULL,
  tax_code      VARCHAR(32)  NOT NULL,
  unit_price    DECIMAL(12, 2) NOT NULL,
  currency      VARCHAR(3)   NOT NULL DEFAULT 'USD'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoices (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  customer_id     INT          NOT NULL,
  status          ENUM('draft','authorized','rejected') NOT NULL DEFAULT 'draft',
  control_number  VARCHAR(32)  NULL,
  fiscal_sequence VARCHAR(32)  NULL,
  currency        VARCHAR(3)   NOT NULL DEFAULT 'USD',
  total_amount    DECIMAL(14, 2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  authorized_at   TIMESTAMP    NULL,
  CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  UNIQUE KEY uniq_control_number (control_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoice_lines (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id    INT NOT NULL,
  product_id    INT NOT NULL,
  quantity      INT NOT NULL DEFAULT 1,
  unit_price    DECIMAL(12, 2) NOT NULL,
  tax_code      VARCHAR(32) NOT NULL,
  CONSTRAINT fk_lines_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_lines_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS seniat_responses (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id    INT NOT NULL,
  http_status   INT NOT NULL,
  request_body  MEDIUMTEXT NOT NULL,
  response_body MEDIUMTEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resp_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  actor         VARCHAR(64)  NOT NULL,
  action        VARCHAR(128) NOT NULL,
  payload       JSON         NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_action (action),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
