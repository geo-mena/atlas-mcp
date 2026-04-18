# Atlas synthetic sandbox

A self-contained PHP eBilling fixture that reproduces the SHAPE of a country-routed eBilling monolith for the purpose of exercising Atlas's reverse-engineering pipeline. **Not real SENIAT. Not real DHL data.** Synthetic only.

## What's here

- PHP 8.3 monolith (`php/`) with manual front-controller routing for `/ve/invoice` and catalog reads
- A Node-based mock that returns SENIAT-shaped XML envelopes (`seniat-mock/`) under namespace `urn:atlas:sandbox:seniat:v1`
- MySQL schema + deterministic seed data (`db/`)
- Confluence-style markdown corpus + a synthetic Jira ticket (`corpus/`)
- Docker Compose orchestration with pinned image tags

## Run

```bash
pnpm sandbox:up        # docker compose up -d
pnpm sandbox:seed      # load deterministic seed data
# UI:    http://localhost:8080/ve/invoice
# Mock:  http://localhost:8081/seniat-mock/health
pnpm sandbox:down      # stop
pnpm sandbox:reset     # drop volumes + reseed
```

## Compliance posture

This sandbox does NOT integrate with the real SENIAT, does NOT hold real DHL data, and does NOT generate fiscally valid invoices. It is a development-time fixture for reverse-engineering tooling. Production use against real fiscal endpoints is out of scope.

## Day 0 status

Routes return 501. SENIAT mock returns hardcoded canned response. Real handlers land Day 1 of the build plan.
