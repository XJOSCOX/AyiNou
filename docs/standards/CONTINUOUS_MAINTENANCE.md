# Continuous maintenance

Cadences below are proposed operating defaults. Platform owner is the current escalation point. Technical, review, privacy and legal roles require real appointments before delegation. This document establishes no scheduled automation.

| Proposed cadence | Responsibility | Evidence to record |
| --- | --- | --- |
| Each change | Feature maintainer, with authorized reviewer on sensitive changes | Audit inventory and coverage, access matrix, regression results, translation completeness, docs and feature flag state. |
| Weekly or urgent advisory | Dependency/CI maintainer pending | Advisory and CI triage, prioritized upgrades, reproducibility and test defects. Expedite known severe or active exploitation. |
| Monthly and on role changes | Platform owner and access reviewer pending | Privilege grants/revocations, reviewer conflicts, role expiration, audit completeness and user feedback trends. |
| Monthly and before rollout | Feature and performance maintainers pending | Slow endpoints, payload/DB budgets, error trends, browser regressions and improvements measured against baseline. |
| Quarterly before production use | Recovery operator and reviewer pending | Backup inventory, controlled restore rehearsal, recovery time and data-loss bounds, access and monitoring sign-off. |
| Quarterly and after schema changes | Privacy lead and lawful authority pending | Retention, consent, disclosure, deletion dependencies and holds. Verify existing synthetic gates and approvals. |
| Before public copy/release | Localization reviewers and qualified legal/product reviewers pending | Four-language changes, accurate status/claims, reviewed policies, notices and intended audiences. |
| After incident or material failure | Incident owner and independent reviewer pending | Timeline, containment, evidence scope, corrective action, regression and assigned follow-up date. |

Track overdue decisions explicitly. Resolve expired access, stale documentation and flags through an identifiable owner. Review stats and diagnostic retention with privacy and operations before adopting any new telemetry.
