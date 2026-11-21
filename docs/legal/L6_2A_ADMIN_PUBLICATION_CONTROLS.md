# L6.2A administrator publication controls

**Operational foundation only. No Ayinou legal policy is approved, published or accepted.**

## Authority and precedence

Platform administration, legal approval and publication authorization are separate decisions. The authenticated Fastify administrator route checks the current role assignment and recent Supabase TOTP on every request; the database RPC checks the current administrator assignment again. An organization owner, staff member or moderator receives no legal authority through that relationship. A change requires a reason of 10–500 characters, the expected revision, a UUID request ID and explicit UI confirmation. The RPC serializes writes, records an audit event in the same transaction and returns an identical result for an identical request replay. A different payload using the same request ID fails.

The public Legal Center displays a release only when **all** gates pass: the global database setting is enabled and not suspended; the policy setting is enabled, published and effective; its version and SHA-256 digest match a release in the immutable committed registry; and the L6.1 registry validator accepts the release and its trusted source and evidence records. The API returns only authorized policy IDs and exact versions. Next.js reads this availability with `no-store` and renders only that version. Database settings cannot create release content. Database or API failure produces the localized unavailable page. An unknown requested version returns 404.

The current release and evidence registries are empty. All nine settings begin in `draft`, disabled, with no release version or approvals. An administrator can inspect them, but activation is refused. The tenth L5 working translation set is not an Early Partner publication slot; that future program remains unavailable.

## Persistence and states

Migration `20261121010000_l62a_legal_publication_controls.sql` adds private global settings, per-policy settings and append-only publication audit rows. The policy state vocabulary is `draft`, `under_review`, `approved`, `scheduled`, `published`, `suspended`, `superseded`, `withdrawn`. L6.2A exposes no state-approval command. Future reviewed release provisioning must supply immutable, independently authorized evidence and an effective date before an operational enable can move an eligible policy into `published`.

All three tables have RLS and no direct `anon`, `authenticated` or `service_role` table grants. Four narrowly granted service-role RPCs serve public availability, administrator status, audit history and versioned actions. The service role does not receive a generic table write endpoint. The administrator audit returns the latest 100 events; records are never deleted by the application. The public API does not expose reasons, actors, digests or approval references.

## Suspension and recovery

An administrator can disable or emergency-suspend the global route or an enabled policy. The RPC records the actor, time, reason, old/new state and old/new revision. Suspension preserves release digests and audit history. Restoration requires a fresh current role/MFA check, reason, revision and all current release eligibility checks. Independent dual control for a future real release remains to be added when qualified approvers are available. Suspension changes public availability; it does not cancel the legal effect of an agreement already accepted or remove any future required notice. No acceptance records or notices exist in L6.2A.

## Signup readiness and remaining decisions

The admin panel shows Terms acceptance, Privacy acknowledgment, optional consent and material notices as inactive. Signup keeps its existing behavior and cannot record acceptance of an unpublished draft. The owner’s planned 18+ invitation-only pilot is separate work. The L4 approval register and L5 readiness report remain open. Before publication, Ayinou still needs an identified operator, qualified source and jurisdiction reviews, reviewed translations in all four languages, owner and independent publication authority, effective dates, operational notices, and explicit release provisioning. Real privacy request processing remains disabled.
