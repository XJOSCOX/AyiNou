# O4 identity-gated organization setup

Baseline `d6eef383007f772bd27bcb92904136c76a92be5b` on `main`.

## Scope

Organization signup continues through one personal account and the existing profile steps. Members can save or cancel an O2 intent, save private O4 details, check publicly visible matches and confirm a new organization or submit a claim. Completion creates one unverified ordinary institution with the existing owner membership, or records a pending application for an existing institution. Existing invitations, memberships, logos, switching, and custom roles use their existing authority model.

## Data model and API

`20261121040000_o4_organization_setup.sql` extends the existing RLS-protected organizations, O2 intents and institutional audit tables. Registration is separate from institution kind and verification. States are unknown, informal or unregistered, pursuing registration, and registered as declared. Legacy records default to unknown. No registry number or document is required or collected. Complete intents retain a minimal result and clear the current draft. O2 command receipts and completed snapshots remain private.

| Route | Behavior |
| --- | --- |
| `GET /api/v1/me/organization-onboarding/setup` | Live eligibility, current intent/version, private draft and latest own completion with current claim status. |
| `GET /api/v1/me/organization-onboarding/matches` | Bounded public-profile matches for an authenticated member, subject to the existing discovery read budget. |
| `PUT /api/v1/me/organization-onboarding/:id/details` | Saves bounded new-organization fields or an existing handle against the current intent version. |
| `POST /api/v1/me/organization-onboarding/:id/complete` | Checks a versioned authority declaration and live eligibility. Creates an ordinary organization and owner or submits an independent claim. |
| `PUT /api/v1/institutions/:id/registration` | An eligible current owner can correct a private declaration when the institution is outside protected categories and review locks. |
| `POST /api/v1/institutions` and claim via `POST /api/v1/me/verification` | Existing request shapes receive a setup-required response. SQL also retires the old create and claim entry points. Other verification submissions and institution updates continue through their current handlers. |

## Permissions and audit

Service-only RPCs derive the actor from the authenticated session and recheck it in PostgreSQL. Successful setup requires completed personal onboarding and current independently reviewed personal identity. Bootstrap status, held or revoked records, and synthetic Founder Verified grants do not qualify. A separately named future founder predicate checks the O3 case, active grant, consent, valid consumed proof, authority and restrictions. The O4 parity gate independently returns false and needs a separately reviewed change. Project, poll and platform authorization continue to use their own checks.

The single completion transaction records organization creation, initial ownership, the registration and authority declarations, and setup completion in the institutional ledger. The issuer confirms the exact intent revision. Claim submission records the declaration with the existing application. The existing review function retains two distinct, eligible, assigned and unconflicted approvals. The O4 wrapper rechecks applicant identity and authority before each approval. Existing pending claims can be reaffirmed with the same private references and current institutional snapshot. No transfer occurs at submission or after one approval. Government creation, kind changes into or out of government, and ordinary ownership claims for government institutions are protected.

Registration corrections atomically record the version, new declaration and receipt. Draft saves and cancellation are durable through existing O2 receipts. Ordinary edits use current institution-role checks. The API logs only bounded authorization outcome codes and the request reference for O4 refusals; failed commands create no success event.

## Privacy and lifecycle

Registration is a private declaration shown to current owners and administrators. Claim reference URLs stay in the existing restricted evidence table and stay out of routine logs. No application ref, documentation, government ID, tax identifier, registry number or private contact information is returned by public profiles, matches, discovery, following, logos, representatives, account selection, projects, communities or polls. The public institution verification indicator keeps its existing meaning. Private audit, receipts and evidence inherit their existing restriction and lifecycle posture. O5 needs a governed recovery, export, retention and deletion review before broader processing.

## Localization and accessibility

The existing signup and personal onboarding lead to a responsive draft editor, public match search, review and explicit confirmation. Existing public claim links redirect to organization setup. A member can use invitations directly in Institutions. Completion and claim status are presented in text and status announcements in Haitian Creole, French, English and Spanish. The existing theme tokens and full-width signed-in shell are reused.

## Reliability and recovery

An actor lock coordinates intent commands. Decisive setup and claim approval share the existing trust decision lock before locking the subject, identity record and target institution. The unique handle constraint is the final duplicate guard. Fuzzy name matches guide members and do not reserve handles. UUID request keys, versions and a payload digest make exact retries safe and reject conflicting replays. Registration retries return the committed audit receipt after checking current ownership. Failed decisive writes roll back the organization, role and events together. Older clients receive an explicit setup-required error even before the database rollout.

## Validation and CI

Disposable tests cover blocked legacy entry points, cross-account and stale-session denial, held and revoked identity, synthetic Founder Verified exclusion, missing authority, private registration, handle races, replay, concurrent audit state, preserved established ownership, government protections, independent claim review and project/poll privilege boundaries. Browser tests cover four languages, keyboard use, mobile and desktop and draft resume. Hosted validation is read-only and includes the linked migration dry run.

Local results: 53 Chromium tests, 48 API tests, seven client tests, shared contracts, four-language parity, typecheck, lint, both production builds, S1 standards, L5 source validation and Legal Center checks passed. The disposable runner removed its stack. The hosted read-only catalog confirmed the independent identity function is present and O2, O3 and O4 are still pending.

## Documentation and operations

Apply only after separate authorization to hosted project `hcbxulyfmdmuyccgrujs`: O2 `20261121020000`, O3 `20261121030000`, then O4 `20261121040000`. Deploy the matching API and frontend after the database postflight. During a database-first window the older API still fails closed at the legacy SQL create and claim calls. Verify empty Founder Verified activation, legacy registration remains unknown, owners retain management, and authenticated roles cannot mutate private tables directly. For recovery, use a forward fix or pause O4 commands while keeping legacy create/claim SQL closed and preserving audit history.

## Remaining blockers

O5 needs governed corrections and recovery for stale legacy claim snapshots, contested or protected ownership, conflicts and assignments. The existing O2 safeguard blocks cancellation when the account has protected ownership or claims; a narrower dependency model belongs in O5. Public display of declared or confirmed registration, a separate government creation procedure, independent registration findings and operational Founder Verified parity still need approval. Hosted writes have not been authorized in this phase.
