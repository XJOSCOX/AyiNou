# Rules & Permissions master plan

| Phase | Owner decision and implementation status |
| --- | --- |
| R1 — inventory | Complete. Source and hosted catalog inventory and staged recommendation are recorded in the [R1 index](R1_COMPLETE_RULE_INVENTORY.md). |
| R2.1 — Public Homepage Rules | Founder approved public Community Statistics ON by default. Versioned PostgreSQL setting, private Founder control and audited update are implemented. Deployed to hosted development and verified with the local application. [R2.1 report](R2_1_PUBLIC_HOMEPAGE_RULES.md) |
| R2.2 — Registration and referrals | Independent Personal Signup and Organization Signup, signup mode, referral intake and audited Founder controls. Deployed to hosted development and verified with the local app. [R2.2 report](R2_2_IMPLEMENTATION_REPORT.md) |
| Policy audit history | Founder-only history for R2.1 and R2.2 showing the source actor, date, values and reason. Deployed and verified in hosted development. [Audit history](PLATFORM_POLICY_AUDIT_HISTORY.md) |
| R2.3 — Member onboarding and profiles | Individual onboarding and profile visibility settings, with explicit member disclosure preferences. Deployed to hosted development and verified locally. [R2.3 implementation report](R2_3_MEMBER_ONBOARDING_AND_PROFILES.md) |
| R2.4 and later | Deferred for separate owner direction. |

## Current registry and boundaries

| Key | Type and default | Scope and change authority | Failure behavior |
| --- | --- | --- | --- |
| `homepage.community_statistics.enabled` | Boolean, explicitly seeded ON at revision 1 | Global public homepage. Active recognized Founder with current MFA and a session-bound private administration workspace. The update requires the current revision and a written reason. | An unconfigured or unavailable homepage policy read keeps the section hidden. The existing statistics projection retains its jurisdiction and privacy controls. |

Store effective values in PostgreSQL and use the active value at request time. Record timestamped, actor-bound revisions for successful changes. Restore an earlier value through a new audited update. Sensitive bootstrap credentials, provider keys, service credentials and deployment secrets remain under protected environment and operational custody.

Future settings need a typed definition, explicit ownership, permitted ranges and dependencies, privacy and security review, a safe transition for in-flight work, and an owner-approved release. Existing protected domains retain their own effective controls.

## R2.1 outstanding items

Hosted development rollout is complete. A hosted application deployment and public launch remain separate operational steps.
