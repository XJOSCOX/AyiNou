# C4 final security review

## Protected boundaries

Guests can read the existing independently published organization projection only when its stage is open. Member discovery requires an account, with consent and data isolation enforced separately for For You, Saved and expressions of interest. Organizations use existing native/custom-role permissions and separate verification. Reviewers need current identity and a jurisdiction-specific grant as well as a valid independent assignment. Founder configuration and activation require a recognized Founder, verified session and original private workspace. Mentorship reports remain case-scoped.

C4.6 keeps the existing public RPC signatures and ACLs. The migration adds a single service-only RPC and three private RLS relations. The underlying functions fail closed for stale sessions and changed stage state. Protected platform controls do not grant access to partner records or an exemption from review.

## Findings

| Severity | Finding | Correction |
| --- | --- | --- |
| High | C4 had separate test switches but no common independent activation and pause contract. | Stage state, digest, dependency checks, receipts and scoped emergency controls now enforce a shared contract. |
| High | A reviewer could decide after assignment without an explicit reviewer acceptance receipt. | Decisions now require acceptance matching the current revision, reviewer, grant, assignment deadline and unique assignment receipt. |
| High | An emergency publication pause that rewrites every eligible row can fail if the transaction exceeds its budget. | An indexed cutoff recorded in the pause transaction excludes earlier disclosures and avoids rewriting the listing population. |
| Medium | Opportunity disclosure checked blocking against the responsible representative only. | Organization disclosure and destination checks also consider the publisher. |
| Medium | C4 shared data needed a distinct review disposition in disposable lifecycle planning. | The synthetic preview includes a coarse shared-data blocker and omits third-party content. |

The existing external flow verifies the exact HTTPS destination and independent ownership or authorized-use evidence. Link safety is evaluated at approval and active use, and the external site can change afterward. Revalidation and fraud monitoring need operating procedures. The platform does not retrieve external credentials or run automatic external requests.

See the [full test record](C4_FINAL_END_TO_END_TESTS.md). Operational privacy, review and safeguarding evidence is separate from development tests.
