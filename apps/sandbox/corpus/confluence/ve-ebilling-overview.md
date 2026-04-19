# Venezuela eBilling — overview

> Synthetic Confluence-style document for the Atlas sandbox. NOT a real ExampleCorp document. NOT a real SENIAT specification.

## Scope

This page describes the end-to-end flow for issuing electronic invoices in Venezuela through the synthetic ExampleCorp sandbox. The flow is intentionally country-routed (`/ve/*` paths) to mirror the CRA8-archetype monolith pattern.

## Lifecycle

An invoice transitions through the states **draft → authorized → rejected**. Once authorized, the invoice is immutable and carries a control number assigned by the regulator.

## Functional steps

1. **Draft creation** — the operator opens the invoice form at `/ve/invoice`, selects a customer, picks document type and currency, and lists products with quantities.
2. **Validation** — required fields are enforced client-side and re-validated server-side. Customer must exist; product SKUs must exist; currency must be in the catalog.
3. **Persistence** — on submit, a row is written to `invoices` (status `draft`) with associated `invoice_lines`.
4. **Regulator transmission** — the controller composes a SENIAT-shaped XML envelope and posts it to the regulator endpoint.
5. **Response handling** — on a 200 response the invoice is updated to `authorized` with the assigned control number and fiscal sequence; on 400 it is updated to `rejected` with the regulator error code; on 5xx the controller retries up to N times before recording `rejected`.
6. **Status visualization** — the operator is redirected to `/ve/invoice/<id>` which renders the final state.

## Required fields per line

| Field      | Type    | Required | Notes                                                      |
| ---------- | ------- | -------- | ---------------------------------------------------------- |
| product_id | int     | yes      | Must reference an existing product                         |
| quantity   | int ≥ 1 | yes      |                                                            |
| unit_price | decimal | yes      | Defaults to product's catalog price; operator may override |
| tax_code   | string  | yes      | Must be one of `IVA-G`, `IVA-R`, `IVA-A`, `EXEMPT`         |

## Catalogs in scope

- Document types — see `/ve/catalog/document-types`
- Tax codes — internal table `tax_codes`
- Currencies — internal table `currencies`
- Customer identification types — synthetic format `J-<digits>` (no real RIF)

## External dependencies

- Regulator authorization endpoint: `${SENIAT_BASE_URL}/seniat-mock/authorize`
- Regulator namespace: `urn:atlas:sandbox:seniat:v1` (synthetic, not real SENIAT)

## Audit

All operator actions are written to `audit_log` with an `actor` identifier, `action` name, and `payload` JSON. Audit rows are append-only.

## Compliance disclaimer

This document is a fixture for development-time tooling. It does not describe a real regulator integration. Production use against real fiscal endpoints requires regulator review.
