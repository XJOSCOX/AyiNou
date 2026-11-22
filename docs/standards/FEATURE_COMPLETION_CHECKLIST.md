# Feature completion checklist

Create `*_IMPLEMENTATION_REPORT.md` or explicitly register another report path. Use the headings below as level-two Markdown headings. Every section requires a substantive entry. Explain any exception, particularly for security-sensitive behavior. Link to actual source, decision documents or tests rather than recording only a pass label.

| Required heading | Record |
| --- | --- |
| Scope | What changed, affected users and compatibility boundaries. |
| Data model and API | Storage, constraints, migrations, shared contracts, endpoints and existing consumers. |
| Permissions and audit | Actor/resource matrix, database enforcement, denial tests, durable events, transaction boundaries and explicit non-audited operations. Update the coverage matrix. |
| Privacy and lifecycle | Data classification and minimization, consent, retention, export, deletion, holds and evidence access. |
| Localization and accessibility | All four locales, keyboard/focus/labels, responsive mobile and desktop behavior and relevant assistive technology. |
| Reliability and recovery | User recovery, retries, idempotency, concurrency and rollback/reconciliation. |
| Validation and CI | Unit, integration, RLS allow/deny and browser results, CI run and actual status. Explain tests that do not apply or are blocked. |
| Documentation and operations | Updated docs, accountable roles, exact hosted development project and migration authorization, before/after history and preservation evidence, postflight, actual application deployment state and recovery. |
| Remaining blockers | Pending decisions, verification limits and follow-up. |

Close the module only after the [hosted development workflow](../deployment/HOSTED_DEVELOPMENT_WORKFLOW.md) has been satisfied. Keep outstanding approvals or deployment fixes in the current phase.

Add a record to [feature-reviews.json](feature-reviews.json). Register each Fastify route addition or contract change with the verb and path, the exact route inventory line as its contract, its access class, audit declaration (durable event or a reason for no durable event), and authorization evidence. An explicitly public operation may use a reasoned authorization exception. For restricted routes, list a checked-in test file and the denial scenario a reviewer should find. Existing route changes with no method/path/body-limit/hook change still require human review but cannot be discovered by this check.

For each new or edited migration, record RLS and grants, authorization, compatibility, disposable validation, rollout and rollback. Report absent schema work as such. This register is a verified set of references and review declarations. The [standards check](../../scripts/check-engineering-standards.mjs) cannot judge test strength or prove authorization. Preserve the existing translation and legal checks for their respective namespaces and artifacts.
