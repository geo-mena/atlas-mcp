# Venezuela — control number policy

> Synthetic Confluence-style document. NOT a real ExampleCorp policy.

## Definition

A **control number** is the regulator-assigned identifier returned in a successful authorization response. It is unique per taxpayer per fiscal period.

## Format

`VE-<numeric>` where `<numeric>` is a monotonically increasing integer assigned by the regulator. The operator MUST NOT assume any specific length.

## Reservation

Control numbers are NOT reserved client-side. The control number is unknown until the regulator response is received. Until then, the invoice carries a NULL control number and status `draft`.

## Uniqueness

Control numbers MUST be unique per taxpayer per fiscal period. The database enforces uniqueness at the column level via `UNIQUE KEY uniq_control_number`.

## Idempotency

The regulator endpoint is NOT idempotent in this sandbox. A retry after a 5xx may produce a duplicate authorization with a different control number; the controller MUST NOT retry on 200 or 400 responses.

## Storage

The control number is stored in `invoices.control_number` and is also captured verbatim in `seniat_responses.response_body` for audit traceability.
