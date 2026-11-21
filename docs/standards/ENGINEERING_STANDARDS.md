# Engineering standards

## Interfaces and architecture

| Boundary | Expected practice |
| --- | --- |
| Fastify | Use versioned `/api/v1` routes, existing typed contracts and stable localized error codes. Bound bodies, queries and pagination. Validate unknown input at the edge. Derive actors from verified sessions. Keep service credentials server-side. |
| Next.js | Keep routes and server layouts in the App Router, feature logic in existing modules and recurring UI in shared components. Reuse current member shell, theme and locale infrastructure where appropriate. Read nested Next.js instructions. |
| Shared contracts | Keep exports additive or use an explicit compatibility plan. Review the shared inventory diff. Validate server-side regardless of TypeScript types. |
| PostgreSQL | Review effective definitions after later migrations and every applicable grant. Enable RLS where appropriate, qualify definer references, minimize execute grants and verify both actor and target. Use ordered, additive migrations and disposable tests. |
| Commands | Specify transaction/lock boundaries, version checks, request fingerprint and idempotency scope. A matching retry can reuse its receipt after current authorization is checked. Compare complete request intent before treating a retry as equivalent. Use an outbox or equivalent reconciliation for external effects. |
| Audit and logging | Reuse domain events and stable taxonomy. Couple required success events to writes. Emit sanitized diagnostic codes and request references. Restrict reasons or evidence using the [event policy](AUDIT_EVENT_POLICY.md). |

Keep private responses uncached at the API and browser layers. Bind local state and in-flight responses to the active subject, resource and session. Recheck sensitive permissions after session refresh or revocation. Cache public projections only when their freshness and visibility rules allow it.

## Experience and performance

Support `ht` by default plus `fr`, `en` and `es`, including errors, labels, prompts and screen-reader text. Preserve entered values on recoverable failures where safe. Check phone, tablet and wide layouts, both themes, keyboard order, visible focus, screen-reader labels, reduced motion and touch targets. Use responsive layouts and theme tokens.

Measure costly paths before optimizing. Bound payloads, query counts, database scans and expensive retries. Check realistic cardinalities, failures and slow connections. Align indexes with access scope and stable pagination. Set explicit budgets for expensive paths and use telemetry that avoids exposing private payloads.

## Release safety

Use feature switches only where they serve a rollout decision. Give production-relevant switches a safe default, a named owner, authorization at the server and a retirement plan. A flag cannot override authorization or legal approval. Plan application/schema compatibility, smoke checks, stop conditions and reversible mitigations. Use forward corrective SQL or approved recovery if a migration cannot safely be reversed. Preserve evidence and restrict access when full rollback is unsafe.

Run the [completion checklist](FEATURE_COMPLETION_CHECKLIST.md). Keep the existing CI quality, builds, disposable Chromium smoke, dependency audit and legal integrity checks. S1 adds a lightweight declarations check. It establishes that specified evidence and reviews are present, while tests and human review establish behavior.
