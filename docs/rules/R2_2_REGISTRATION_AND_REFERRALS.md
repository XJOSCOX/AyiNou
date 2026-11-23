# R2.2 Registration and referrals

The Founder opens **Platform Administration → Platform → Registration**. Each change requires a current private workspace, recent authenticator verification, the current revision and a written reason of at least ten characters. The policy controls new accounts. Existing members can sign in, recover passwords and continue onboarding under the existing rules.

## Registration and invitations

Personal Signup and Organization Signup can be switched independently. The registration form shows only enabled paths. Switching both off blocks ordinary account creation. Both signup options create a personal account. The organization option records the existing O2 onboarding choice. An earlier account or organization draft keeps its existing permissions and workflow if a signup option is later switched off.

In invitation-only mode the Founder can create a seven-day, single-use invitation for the exact recipient email and signup path. Share the code privately. The recipient enters it on the signup page with the same email and path. Closed mode, disabled registration and a disabled path block ordinary invitations. Community, affiliation and organization invitations remain existing-account actions.

The reserved Founder flow remains independent of public policy. Its existing unlocked server form supplies a derived proof tied to the prepared Founder email and temporary handle. The provider's email verification and the existing MFA/bootstrap claim still apply. The proof is removed before Auth persists user metadata.

## Referrals

Phase 2C already allocates stable random referral codes, validates them with a bounded public endpoint, supports `?ref=` and keeps a private attribution ledger. Account settings retains the member's code and confirmed count, with copy/share available for public registration while referrals are on. Referral codes are optional and confer no registration eligibility.

The initial account insert may snapshot an eligible referral. Confirmation requires an eligible account and provider evidence of email verification. A development auto-confirmation timestamp alone does not qualify. The system checks live eligibility before confirmation and uses the existing unique referred-user record to avoid duplicate credits. Turning referrals off prevents new capture and confirmation while preserving existing rows and confirmed counts. Rewards remain off.

See the [policy matrix](R2_2_POLICY_MATRIX.md) and [verification report](R2_2_IMPLEMENTATION_REPORT.md).
