# Venezuela — error handling

> Synthetic Confluence-style document. NOT a real ExampleCorp policy.

## Error classes

| HTTP        | Regulator code         | Meaning                               | Controller action                                                                           |
| ----------- | ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| 400         | MALFORMED_REQUEST      | Envelope is empty or not XML          | Mark invoice `rejected`, surface message                                                    |
| 400         | INVALID_TAXPAYER_ID    | Taxpayer identifier is not recognized | Mark invoice `rejected`, surface message                                                    |
| 400         | MISSING_REQUIRED_FIELD | A required field is absent            | Mark invoice `rejected`, surface message                                                    |
| 503         | SERVICE_UNAVAILABLE    | Regulator is temporarily unavailable  | Retry up to 3 times with exponential backoff (1s, 2s, 4s); on final failure mark `rejected` |
| 5xx (other) | —                      | Unexpected regulator failure          | Same retry policy as 503                                                                    |

## Retry policy

- On 200 → no retry, accept response.
- On 400 → no retry, mark `rejected`, surface error to operator.
- On 5xx → retry up to 3 times with exponential backoff (1s, 2s, 4s).
- On network timeout → treat as 5xx for retry purposes; default timeout is 10 seconds.

## Operator feedback

All errors are surfaced via the `error.php` view with the regulator message. The internal regulator code is logged in `audit_log` but not shown to the operator.

## Logging

Every regulator interaction is logged to `seniat_responses` with the full request and response bodies. Sensitive fields (none today) would be redacted before logging in a real integration.
