# Identity verification and badges

| Owner-approved design | Observed status |
| --- | --- |
| The recognized Founder may directly approve or reject an eligible regular identity application. | **Deployed to hosted development.** Approval displays blue and has distinctly recorded Founder provenance. Original-session admin workspace, recent MFA, current case, evidence and conflict checks apply. |
| The ordinary reviewer path uses two distinct, eligible, assigned and unconflicted reviewers. | **Implemented.** Initial approval stays pending. A Founder or Administrator contributes at most one vote and needs a separate current reviewer designation and eligible case assignment. The applicant cannot review themself. The review, evidence references and issue/hold/revoke lifecycle keep their existing controls. |
| Open Founder cases without requiring a member application. Reserve issuance for the formal Founder under the identity policy. | **Implemented** for scoped consent-request opening and containment by eligible O3 operators with recent MFA. Real issuance and release are **implemented but disabled**. They require trusted Founder provenance, active O3 scope, recent TOTP, current proof of identity/account control, versioned consent, and conflict clearance. No self-issuance. Approved proof, restricted evidence custody, independent appeals and issuance require **operational approval**. |
| When gold is granted, automatically close the eligible pending regular application and keep its history. | **Implemented and deployed.** A successful grant can atomically close the application as `superseded_by_founder_verification`. The submission, evidence references, review work, decisions, reason and audit provenance remain available within existing access controls. |
| Preserve active holds and completed ordinary decisions. | **Implemented.** A Founder grant does not erase an approved blue identity or reopen a case on revocation. No retroactive blanket closure or deletion. Members may apply again under existing eligibility. |
| The recognized Founder may decide or delegate an ordinary organization verification request, including their own organization’s request. | Founder decisions have separate provenance. Protected government and ownership claim procedures and independent project eligibility retain their controls. |
| Keep leadership, proof and product eligibility independent. | **Implemented.** A challenge or badge cannot grant platform roles, independent project/poll eligibility, institution ownership or organization verification. FV-FINAL supports O4 parity for approved live gold on eligible new ordinary nongovernment organizations. The development gates remain closed. General identity-provider and email/SMS proof integrations are **not implemented**. |

| Designation | Public mark and authority source |
| --- | --- |
| Founder | Red `founder.png` as primary role mark. Trusted bootstrap provenance. |
| Administrator | Green `admin.png` from eligible active platform assignment. The Founder’s routine parity does not add a second leadership mark. |
| Identity Verified | Blue `verified.png` from an eligible Founder decision or two independent reviewer approvals. |
| Founder Verified | Gold `founder-verified.png` from active Founder proof, current consent and disclosed provenance. |

A role mark can appear alongside an identity mark, including green with gold when eligible and disclosed. When blue and gold both apply, blue takes display precedence and eligible verification details can show gold provenance. Holds and revocations remove the affected identity mark without independently changing an unrelated role. Respect profile visibility, block policy, subject disclosure and the selected surface’s projection. Use text labels with the supplied icons. A complete cross-surface conformity inventory is still **not implemented** as a single policy/test suite.

**Evidence.** [Owner-approved Founder verification policy](../organizations/FOUNDER_VERIFICATION_POLICY_UPDATE.md) · [Supersession report](../organizations/FOUNDER_REVIEWER_AND_SUPERSESSION_REPORT.md) · [O3 report](../organizations/O3_IMPLEMENTATION_REPORT.md) · [Consent migration](../../supabase/migrations/20261121090000_founder_supersession_consent.sql) · [Badge component](../../apps/web/src/components/designation-mark.tsx)

## Founder Verified integration update

The reviewed candidate adds member account-control receipts, structured Founder attestation and trusted bootstrap authorization from the original S2C workspace. Issuance and live proof remain closed. The scoped workflow preserves the separate independent path and current higher-trust identity requirements. [Integration report](../identity/FOUNDER_VERIFIED_COMPLETION_REPORT.md)
