# C1 nationwide department configuration

## Scope

The existing Founder Community Needs Pilot workspace now selects among Artibonite, Centre, Grand’Anse, Nippes, Nord, Nord-Est, Nord-Ouest, Ouest, Sud and Sud-Est. It reuses the ten existing department community identifiers. Each department starts disabled unless a Founder later authorizes an eligible configuration and separately activates it against current independent evidence. This release creates no policy, enrollment, grant, evidence, case or fixture row.

## Data model and API

The migration changes the primary keys of existing private policy, enrollment and history records to include department scope. Legacy enrollment and decision records receive the Ouest ID while their previous revision, digest, timestamps, reason and values are preserved. Existing Ouest policy values are preserved, with the equivalent eligibility requirement and existing 20-person cap. The existing Founder endpoint accepts a department selector and department or emergency pause decisions. Explicit release arguments span the backend and protected database stage checks in the same call. The prior RPCs still serve the Ouest compatibility path.

## Permissions and audit

Recognized Founder authority, recent MFA, original-session workspace, confirmation, reasons and idempotent receipts remain enforced. Cohort eligibility and native case authorization are evaluated per department. Every affected emergency scope receives its own new policy revision and a linked receipt. Ordinary staff cannot pause or resume a department. Four distinct independent reviewers and one eligible triager remain required. Each reviewer must hold a separate valid grant before working in a second department. Protected attestation custody and private table grants stay unchanged.

## Privacy and lifecycle

Author reads stay owner-bound. Community snapshots and associated project projections require the department’s own state and appropriate membership. Pause blocks new intake, ordinary assignment and new publication and association decisions. Protected corrections, withdrawals, notices, existing evidence, and eligible ongoing challenges retain their prior scoped behavior. Nationwide pause changes only pilot state and audit history.

## Localization and accessibility

The Founder selector, limits, eligibility, identity requirement, emergency controls and history labels are provided in Haitian Creole, French, English and Spanish. Selector changes discard the previous department’s transient search and confirmation state. Native form controls preserve keyboard interaction. Department names use established proper names.

## Reliability and recovery

Department submissions share an atomic quota lock only with other submissions in the same department. Founder configuration decisions retain exact revisions. Bulk and nationwide pause lock affected policies in a deterministic order, record each affected scope, and replay the same scoped receipt without pausing newly activated departments. Resumption is an independent per-department decision requiring current evidence and release. The hosted data rollout remains separate from the application release and from any provider recovery plan.

## Validation and CI

See [security tests](C1_NATIONWIDE_SECURITY_TESTS.md) for disposable and connected evidence. All routine validation runs locally. No GitHub Actions were used.

## Documentation and operations

See the [nationwide policy](C1_NATIONWIDE_POLICY.md) and [rollout readiness](C1_NATIONWIDE_ROLLOUT_READINESS.md). Keep deployed app routing disabled. Operational attestations are read-only in the Founder interface.

## Remaining blockers

Public processing still requires authorized matching web and API hosting, qualified privacy and retention approval, verified database and private Storage recovery, a named staff roster and cohort, six independently verified operational attestations per activated department, and a separate Founder decision.
