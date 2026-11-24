# P1 deployment readiness

**Classification: Blocked by operational requirements.** Verified builds and tested database permissions support the local and hosted-development boundary. Public release requires a separate dated decision.

| Area | Verified evidence | Remaining launch work |
| --- | --- | --- |
| Revision and database | Main matched origin. 129 hosted migrations matched through `20261124153000`. The dry run contained one separately approved P1 file. Private poll, appeal and native account tables checked had RLS and zero authenticated direct SELECT grants. Staff moderation commands remained service-only. | Authorized apply and postflight for the pending P1 SQL. |
| Build and environment | Workspace typecheck, lint, unit and translation checks, local production build, and production-origin build with explicit synthetic HTTPS origins. | Actual release web, API, proxy/TLS and deployment platform configuration were not exercised. |
| Secrets and API protection | Fastify server-only credentials, explicit CORS origin allowlist, guarded TLS origin rules, redacted cookie/Authorization log fields and matched route-only diagnostics. Protected web workspaces use private/no-store and no-referrer. Media reads use nosniff. | Verify deployed headers, HTTPS/HSTS/CSP posture, injected secret lifecycle, rotation and cross-origin behavior at the real edge. |
| Resource limits and health | Existing bounded body/upload and quota checks; local health, Projects and unsigned policy access status checks. Local HTTP observation confirmed matching CORS origin acceptance, denial of a foreign CORS origin, and private administration no-store, no-referrer and noindex headers. | Real traffic measurement, alert routing, dependency probes, targets and runbook acknowledgement. |
| Recovery and rollback | One forward SQL change with existing signatures and grants. A previous affected view or function can be reapplied in a reviewed forward correction without rewriting histories. The safer fallback is to pause affected traffic while diagnosing. | Verified provider or equivalent backup, restore into quarantine and independent Storage recovery. An app rollback does not undo a database migration. |
| Hosted operations | Authorized read-only project catalogs and no recovery points listed. | Provider Auth, SMTP, redirects, abuse and incident routing, staffed responders and public-launch approval. |

[Repository workflow](../WORKFLOW.md) · [Hosted development procedure](../deployment/HOSTED_DEVELOPMENT_WORKFLOW.md) · [Operational duties](../deployment/D2_OPERATIONAL_RESPONSIBILITIES.md) · [Next.js environment checks](../../apps/web/web-environment.mjs) · [Fastify logging and CORS](../../apps/api/src/app.ts)
