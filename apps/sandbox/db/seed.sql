-- Atlas sandbox seed. Deterministic so the demo replays identically.
-- 5 customers, 10 products, 3 invoices in different states.

INSERT INTO customers (id, name, taxpayer_id, email) VALUES
  (1, 'ExampleCorp Caracas',  'J-100000001', 'caracas@examplecorp.invalid'),
  (2, 'ExampleCorp Maracaibo','J-100000002', 'maracaibo@examplecorp.invalid'),
  (3, 'ExampleCorp Valencia', 'J-100000003', 'valencia@examplecorp.invalid'),
  (4, 'ExampleCorp Maracay',  'J-100000004', 'maracay@examplecorp.invalid'),
  (5, 'ExampleCorp Barquisimeto','J-100000005', 'barquisimeto@examplecorp.invalid');

INSERT INTO products (id, sku, name, tax_code, unit_price, currency) VALUES
  ( 1, 'SKU-001', 'Express Envelope',          'IVA-G',  9.50,  'USD'),
  ( 2, 'SKU-002', 'Standard Box S',            'IVA-G', 14.00,  'USD'),
  ( 3, 'SKU-003', 'Standard Box M',            'IVA-G', 22.00,  'USD'),
  ( 4, 'SKU-004', 'Standard Box L',            'IVA-G', 36.00,  'USD'),
  ( 5, 'SKU-005', 'Cold-Chain Pack',           'IVA-A', 65.00,  'USD'),
  ( 6, 'SKU-006', 'Hazmat Box',                'IVA-A', 120.00, 'USD'),
  ( 7, 'SKU-007', 'Customs Brokerage Service', 'IVA-G', 45.00,  'USD'),
  ( 8, 'SKU-008', 'Insurance Surcharge',       'EXEMPT', 5.00,  'USD'),
  ( 9, 'SKU-009', 'Documentation Service',     'IVA-R', 12.50,  'USD'),
  (10, 'SKU-010', 'Returns Handling',          'IVA-G',  8.75,  'USD');

INSERT INTO invoices (id, customer_id, status, control_number, fiscal_sequence, currency, total_amount, authorized_at) VALUES
  (1, 1, 'draft',      NULL,      NULL,         'USD',  47.50, NULL),
  (2, 2, 'authorized', 'VE-1001', '0000000001', 'USD', 165.00, '2026-04-15 10:23:00'),
  (3, 3, 'rejected',   NULL,      NULL,         'USD', 240.00, NULL);

INSERT INTO invoice_lines (invoice_id, product_id, quantity, unit_price, tax_code) VALUES
  (1, 1, 5, 9.50,  'IVA-G'),
  (2, 5, 1, 65.00, 'IVA-A'),
  (2, 6, 1, 120.00,'IVA-A'),
  (3, 4, 6, 36.00, 'IVA-G'),
  (3, 7, 1, 45.00, 'IVA-G');
