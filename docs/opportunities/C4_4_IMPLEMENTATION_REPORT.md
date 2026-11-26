# C4.4 mentorship matching and coordination

## Scope

C4.4 adds deterministic matching, private discovery and requests, revision-bound agreements, transactional mentor capacity, participant workspaces, learning progress, sessions and case-scoped report triage. It builds on the latest main descendant of the C4.3 release `bb01954`. It reuses native account privacy and blocking, independent identity, the C3 skill catalog, C4.3 role profiles, established notifications and the Founder Opportunity settings workspace.

All hosted operations remain closed. There is no public directory, general messaging, meeting infrastructure, automatic acceptance, payment, credential issuance or national impact reporting.

## Data model and API

Twelve private RLS relations hold the disposable gate, bounded candidate keys, dismissals, requests, agreements, relationships, coordination items, events, receipts, preparation, reports and assigned-case decisions. Only the service backend can execute the coordination and report RPCs. Existing member, profile, role and catalog identifiers remain authoritative.

## Permissions and audit

The service-only RPCs bind to the live session. Participant selection and request eligibility are checked again before contact. The API derives the actor from the session. Both participants must confirm the exact agreement revision. Advisory locks serialize mentor capacity against competing confirmations. Database policies deny direct reads and writes for application roles. Founder preparation uses the existing recognized Founder, recent MFA and active private workspace checks. Case assignees only see the report they are authorized to handle. Native account enforcement and appeal paths continue to govern sanctions. [Security evidence](C4_4_SECURITY_TESTS.md)

## Privacy and lifecycle

The candidate projection excludes private scheduling, professional summaries, contact details and learning objectives. A terminal request clears its introduction. A safety restriction keeps workspace content closed and still permits the authorized participant to end the relationship or submit a report. Consent and record-retention boundaries are detailed in the safeguarding and privacy policy.

## Localization and accessibility

The coordination page uses the existing MemberShell and Opportunity header, offers right-aligned navigation back to preferences and opens secondary controls on demand. Matching, requests, agreements, learning objectives, session proposals and safety reports have localized labels in English, Kreyòl ayisyen, French and Spanish. Native controls and existing feedback handle keyboard access and mobile wrapping. Founder limits and current disabled state are visible in Opportunity settings.

## Reliability and recovery

The database serializes writes on deterministic participant locks and checks expected versions. It stores projection-free receipts and commits required events and notifications with the mutation. Recovery holds both fixture gates closed and preserves case evidence while an additive correction is reviewed.

## Validation and CI

The disposable C4.4 suite passed the full lifecycle and the benchmark at 1,000, 10,000, 50,000 and 100,000 profiles. The first page matched the exhaustive reference in every cohort. Two loopback API processes competed for one mentor slot and committed one activation. The C4.3 suite passed in a fresh disposable stack, including Founder revision checks, unchanged profile eligibility and disabled C4.4 navigation in English, Haitian Creole, French and Spanish at wide and narrow viewports. Local unit, API, shared-contract, localization, typecheck, lint, standards and optimized builds passed. The Community Needs, Impact preparation, Volunteer profile, Professional Opportunities and Opportunity Publication disposable regressions passed. Routine GitHub Actions were skipped as requested. See the performance report for measured values and limits.

Disposable verification corrected composite argument resolution, exact agreement revision lookup, an unauthenticated notification test route, benchmark cohort isolation and a four-language navigation race. Native profile privacy remained part of eligibility. The tested migration bytes matched the approved file at deployment.

## Documentation and operations

The migration is `20261125142000_c44_mentorship_coordination.sql`. Target project `hcbxulyfmdmuyccgrujs`. The exact Founder-approved SHA-256 is `f2f08160071e0bef70502d1dac99b187c1f95fb1110df0adac16aaaf1bca07ee`. The hosted dry run found only the C4.4 migration. Read-only preflight observed 152 applied migrations, 155 data fingerprints, 861 unchanged-scope routine definitions, 25 RLS policies and 16 empty fixture tables. The two native notification functions are outside the unchanged-routine fingerprint because C4.4 extends their existing projections.

The authorized migration applied from `86a9eb6c1d3560541e443dc17486ce290b08051b`. Hosted postflight recorded 153 applied migrations and zero pending. All 155 existing data fingerprints matched, as did the existing RLS policy, relation grants and unchanged-scope routine fingerprints. The 16 earlier fixture tables remained empty. All 12 C4.4 relations were empty with RLS enabled and without direct application-role privileges. Two public RPCs grant execution only to the service role among application roles. Private helpers deny direct application-role execution. Postflight confirmed the narrow mentorship participation restriction capability, both notice projections and zero mentorship notices. The connected J0SC0X browser opened Founder Opportunity settings with owner-entered MFA and verified revision zero, the matching considerations, operational limits and five closed stages. Test02 reached Mentorship coordination from Account settings via the private role profiles, observed the closed message and no send action, and was denied Founder Opportunity settings. Status-only localhost checks passed for health, Communities, Projects, Impact, existing public Opportunities and the organization page. Guest API requests to private member, Founder and moderation routes returned 401 with private no-store and noindex headers. The guest web route redirected to sign-in with the same privacy headers. Hosted fixtures remained empty. Next.js and Fastify run locally. If a rollout requires correction, keep both fixture gates empty and use an additive reviewed repair.

See the [matching policy](C4_4_MATCHING_POLICY.md), [relationship policy](C4_4_RELATIONSHIP_POLICY.md), [safeguarding and privacy](C4_4_PRIVACY_AND_SAFEGUARDING.md) and [disposable performance](C4_4_PERFORMANCE_REPORT.md).

## Remaining blockers

C4.5 remains out of scope. Operational activation requires separately approved adult eligibility, safeguarding, privacy retention, independent moderation staffing, audited access and recovery readiness. G-series decisions own joint-record export, deletion, preservation and legal hold. No stage can be activated by C4.4 configuration.
