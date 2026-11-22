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

## Development release and deployment

Use **Implement → Test → Fix → Deploy to hosted development → Verify → Close phase**. Keep implementation and required migrations in one module. Run the disposable database chain, full applicable regressions and CI for the tested release. Verify the exact hosted development project, source SHA, migration history, dry run and preservation checks. Apply only separately authorized versions. Complete read-only postflight and resolve deployment issues before moving to the next module. Keep an unapproved or blocked migration in the current phase’s open work. Do not accumulate pending migrations across completed phases.

Mark a development module **COMPLETE AND DEPLOYED** only after the code, required hosted database changes and postflight evidence are verified. Record local, CI and hosted evidence separately, including any scope checked only in disposable infrastructure. State whether the matching application was actually deployed or merely tested against the upgraded database. Development completion grants no public-launch authority. [Hosted development workflow](../deployment/HOSTED_DEVELOPMENT_WORKFLOW.md)

## Release safety

Use feature switches only where they serve a rollout decision. Give production-relevant switches a safe default, a named owner, authorization at the server and a retirement plan. A flag cannot override authorization or legal approval. Plan application/schema compatibility, smoke checks, stop conditions and reversible mitigations. Use forward corrective SQL or approved recovery if a migration cannot safely be reversed. Preserve evidence and restrict access when full rollback is unsafe.

Run the [completion checklist](FEATURE_COMPLETION_CHECKLIST.md). Keep the existing CI quality, builds, disposable Chromium smoke, dependency audit and legal integrity checks. S1 adds a lightweight declarations check. It establishes that specified evidence and reviews are present, while tests and human review establish behavior.

## Session and private workflow engineering

Inspect actual Supabase Auth settings, refresh behavior, the Next.js cookie/session adapters, Fastify authorization and PostgreSQL session-backed writes before changing authentication. Establish a trusted original sign-in clock and check current role and session policy at each enforcement point. Test concurrent refresh, privilege changes, logout, session revocation and cross-account workflow access. Keep session and workflow activation behind a separately reviewed rollout. [Session Security implementation plan](../security/SESSION_SECURITY_IMPLEMENTATION_PLAN.md)

## Audit integration declarations

For protected state-changing features, include an audit integration register entry and explain event identity, transactionality, scope, redaction, lifecycle and reconciliation. The CI declaration check establishes that entries and referenced tests exist. Assess the effective security policy and native event effects through disposable testing and human review. [Audit register](../audit/A1A_MISSING_COVERAGE_REGISTER.md)
