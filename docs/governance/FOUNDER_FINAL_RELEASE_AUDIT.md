# Founder release audit

## Scope

Reviewed `444f5c9..da29294855e9e283bb5616df00272527fbfef0ff` on `main`. The table identifies the code and behavior examined for each commit.

| Commit | Code reviewed |
| --- | --- |
| `b23385e` | Migration 08 transaction, historical closure provenance, and the admin queue/history projection. |
| `85e85bf` | Migrations 09 and 10, versioned consent, governed Founder authority, ordinary reviewer workflow, and public claim placement. |
| `8df2d73` | Migration 11, reservation provisioning, account/session binding, startup behavior, public role projection, supplied badge assets and fixtures. |
| `b629ddf` | Public shell, auth routes, modal/sidebar navigation, role indicators, feed and comment author displays, slideshow assets and browser coverage. The feed and discussion changes reintroduced the generic green verification mark. |
| `da29294` | Static brand icon URL and public layout regression checks. No authorization or data changes. |

The audit covers gated development migration readiness. It excludes an operational proof policy, public launch, general username changes and S2.

## Data model and API

Migration `20261121120000_founder_release_authorization.sql` adds one private roster helper and replaces effective functions in place. A bootstrap-only Founder now qualifies for routine project moderation subject to account, authenticator, conflict and project-scope checks. Governance lists eligible role holders and the provenance-backed Founder once. Privacy lifecycle inventory recognizes that Founder authority creates an account dependency and includes the Founder when calculating administrative continuity.

`GET /api/v1/admin/accounts` adds optional typed `personalClaims` to the existing scoped response and retains the previous `verified` field. The admin UI renders those actual claims. Feed and comments use the typed author projection already used by post detail. The Founder Verified public lookup requires issuer provenance as well as active case and subject checks. The change adds no HTTP routes or tables and leaves all historical migration files intact.

## Permissions and audit

The [permission verification record](FOUNDER_PERMISSION_VERIFICATION.md) links the role matrix to executable checks. The audit found role-assignment-only project review, a roster that omitted a bootstrap-only Founder, lifecycle inventory that could overlook a privileged Founder, an issuance projection that did not recheck issuer provenance, and generic or inferred claim labels on feed and admin surfaces. No active hosted Founder grant was found.

Bootstrap consumption commits the singleton and platform audit event together. Recognition derives from both stored records. Ordinary review uses the independent reviewer and work assignments, a current eligible actor, recent TOTP and conflict checks. The second approval requires a currently qualified reviewer distinct from the first. Founder case actions preserve scoped authority, bound consent, proof, version, current session and auditable receipt. Protected governance execution is closed. See the [audit coverage matrix](../standards/AUDIT_COVERAGE_MATRIX.md) for source records, receipts and lifecycle notes.

## Privacy and lifecycle

Members may opt into closing their particular pending regular identity application. The opt-in binds the application ID and revision to the Founder case. Grant, permitted closure, and closure evidence share a transaction. The closed record retains reviews, evidence references, timestamps and the link to the grant with reason `superseded_by_founder_verification`. Declined consent, stale consent, conflict or an independently approved claim leave the ordinary outcome intact. Previously closed records retain the historical event that explains them. A held, withdrawn or revoked Founder designation is excluded from the public projection.

Platform leadership alone grants no read access to private ballots, unassigned identity evidence, restricted privacy cases, or confidential medical data. The release adds no medical data collection or evidence logging. Bootstrap credentials and private email configuration stay outside Git and the general audit projection.

## Localization and accessibility

Founder red, Administrator green, independent identity blue and Founder Verified gold use the official assets and existing contextual labels. The public member page shows identity and platform designation separately. The navbar and private profile present the same distinction. Feed, discussion, post detail and member discovery show publicly eligible ordinary personal claims. Organization team and representative views keep their existing scoped institutional labels. A team position alone carries no public platform or personal identity label. The added badge browser test exercises the feed and comment author labels with keyboard interaction at 375 px in light and dark themes.

The code reuses the Haitian Creole, French, English and Spanish label dictionaries and current theme tokens. The existing browser coverage exercises badge projections, recorded consent controls, dark mode, compact layouts and keyboard navigation. Screen-reader behavior was checked through accessible names and browser semantics, without testing a standalone assistive technology.

## Reliability and recovery

The bootstrap row is a singleton and provisioning locks the reservation. The claim requires a matching confirmed account, an active recently verified Auth session, the current unconsumed high-entropy credential, and request budget availability. Concurrent successful claims reconcile to one receipt. Protected handle checks apply on profile writes, and the retired startup path cannot create a second Founder.

Founder consent and ordinary decisions serialize under the existing scope and application locks. Retried commands reconcile against stored receipts and reject changed inputs. If deployment or postflight is abnormal, halt rollout and preserve business records, restrict affected routes and use a verified forward migration. Never reintroduce automatic closure or reset the database.

## Validation and CI

Baseline `da292948`: all three jobs passed in [Main checks 44963352837](https://github.com/XJOSCOX/AyiNou/actions/runs/44963352837). Local release checks passed for TypeScript, lint, shared contract fingerprints, 34 namespaces in four languages, 48 API tests, seven client tests, both production builds, four S1 tests, legal publication invariants and six frozen legal-source regressions. The dependency audit reported zero vulnerabilities. All 73 Chromium tests passed. The disposable suite applies the complete chain and includes the five-role matrix, original Founder lifecycle and bootstrap tests, supersession races, project and poll protections, and governance checks. Final release-run results are recorded in the delivery report and GitHub Actions for the resulting commit.

## Documentation and operations

See [migration readiness](FOUNDER_MIGRATION_READINESS.md) for the exact hosted read-only evidence, approval checkpoint, release sequence and postflight plan. The operator must confirm the target project, backup/restore capability, and exact approved migration set before executing a separate deployment.

## Remaining blockers

Public launch and real Founder Verified issuance are **NO-GO**. The checked-in proof path is synthetic only and the release gate is closed. Operational identity/account-control proof, retention, neutral appeals, and governed continuity or reassignment require their own review. This audit does not grant any new reviewer assignments or execute governance, activate legal publication, or enable real privacy processing.
