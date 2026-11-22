# Account, Roles & Security Master Blueprint

This index is the decision map for Ayinou accounts, platform authority, identity and privileged workflows. It records the approved target and the observed implementation separately. Baseline `2521017d19c0fc0329567ee2f500ef58760567a1` was verified on local and GitHub `main`. The hosted column uses the last verified F1 rollout record. This documentation review made no changes to hosted infrastructure.

1. [Account and authentication](ACCOUNT_AND_AUTHENTICATION.md) — personal and organization signup, handles and onboarding.
2. [Founder registration](FOUNDER_REGISTRATION.md) — protected reservation, one-time bootstrap and continuity.
3. [Platform roles and permissions](PLATFORM_ROLES_AND_PERMISSIONS.md) — capability matrix and domain separation.
4. [Administrator activation](ADMINISTRATOR_ACTIVATION.md) — existing F1 approval dependency, approved Founder-direct authority and target-bound redemption.
5. [Identity verification and badges](IDENTITY_VERIFICATION_AND_BADGES.md) — review, provenance, badge display and consented supersession.
6. [Session and private workflow security](SESSION_AND_PRIVATE_WORKFLOW_SECURITY.md) — current controls and future policy.
7. [Audit and security requirements](AUDIT_AND_SECURITY_REQUIREMENTS.md) — evidence, privacy, gaps and release conditions.
8. [Implementation and test plan](IMPLEMENTATION_AND_TEST_PLAN.md) — phased dependencies and disposable database testing.
9. [Owner decisions and open questions](OWNER_DECISIONS_AND_OPEN_QUESTIONS.md) — conflicts, recommendations and approvals.

## How to read the status tables

| Label | Meaning |
| --- | --- |
| **Implemented** | A complete supported path exists within the stated scope. Hosted availability is stated separately. |
| **Implemented but disabled** | The path or an explicitly identified subset has code and test evidence. A gate, missing deployment or deliberately limited synthetic scope keeps the named capability unavailable. A schema or fixture alone establishes only that subset. |
| **Not implemented** | The end-to-end behavior is missing. Existing helpers or records are partial evidence only. |
| **Owner decision** | A policy choice remains open. A recommendation here leaves current behavior in force. |
| **Operational approval** | Delivery, staffing, policy activation, data handling, deployment or a destructive step needs separate authorization. |

The owner’s later explicit decisions supersede earlier design proposals. Effective SQL and API checks establish actual behavior. Older reports remain historical records. When the approved target and the implementation differ, the topic page and [decision register](OWNER_DECISIONS_AND_OPEN_QUESTIONS.md) show both. Changes to a policy or feature gate need their own review.

F1 and F1.1 are **COMPLETE AND DEPLOYED** on the hosted development database, with **76 applied migrations and zero pending**. The trusted Founder was preserved, and the matching local application passed read-only compatibility checks. Each future module follows **Implement → Test → Fix → Deploy to hosted development → Verify → Close phase**. Public-launch readiness is separate. [Deployment evidence](../deployment/F1_F1_1_DEVELOPMENT_DEPLOYMENT.md) · [Development workflow](../deployment/HOSTED_DEVELOPMENT_WORKFLOW.md) · [Roadmap](../../ROADMAP.md)
