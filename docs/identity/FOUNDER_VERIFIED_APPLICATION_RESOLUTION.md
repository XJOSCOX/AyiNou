# Founder Verified and regular application resolution

## Scope

A Founder can open an offer without an ordinary application. When the Founder grants gold, Ayinou closes the member’s eligible pending regular identity application automatically. The member still accepts the Founder offer, confirms account control and chooses badge disclosure.

## Data model and API

The closure uses the existing application status and Founder grant reference. Completed decisions, independently granted blue verification and active holds retain their existing protections. A closed application leaves the pending queue and remains available in history. Existing command formats continue to work.

## Permissions and audit

The grant and closure share a transaction and the trust lock used by independent review. No new application role or function grant is required. Historical reconciliation requires current trusted gold provenance and adds a timestamped outcome against the original grant without rewriting the earlier event or recording new member consent.

## Privacy and lifecycle

The original application, evidence, reviewer work and decisions remain under their existing access controls. A later gold hold or revocation preserves the original closure. Independent blue approvals continue to use the ordinary process.

## Localization and accessibility

The Verification screen explains automatic closure in Haitian Creole, French, English and Spanish. It uses the existing one-step acceptance button without a separate closure checkbox.

## Reliability and recovery

Ayinou checks the current application after acquiring the trust lock. A concurrent review can finish before the grant. Otherwise, later votes see the closed status. Repeated reconciliation only considers still-pending applications and leaves previous closure events intact.

## Validation and CI

Disposable scenarios cover one-step acceptance, an existing grant with a pending application, repeated reconciliation, grant replay and races with independent review. All 98 local Chromium tests and all three GitHub Actions jobs passed for release `3c7cc73a4327dacb40e74bce50a8c45cf64244ea`. [Release CI](https://github.com/XJOSCOX/AyiNou/actions/runs/45072250874)

## Documentation and operations

Reconcile eligible legacy applications with the same migration that enables automatic closure for future grants. Confirm the existing grants, holds and ordinary decisions after deployment. [Founder operating procedure](FOUNDER_VERIFIED_OPERATING_PROCEDURE.md) · [Migration](../../supabase/migrations/20261122181000_fv_automatic_application_closure.sql)

## Remaining blockers

The approved migration was applied to hosted development project `hcbxulyfmdmuyccgrujs` with the personal request limits migration. Postflight recorded 88 migrations with zero pending. One eligible pending application closed and retained its history with a reconciliation event linked to the original gold grant. Existing grant and application counts, issuance policy, RLS and restricted grants were verified. The application code was pushed to `main`. No cloud application deployment was performed.
