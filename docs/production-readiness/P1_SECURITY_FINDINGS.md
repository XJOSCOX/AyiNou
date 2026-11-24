# P1 security and privacy findings

| Severity | Confirmed | Resolution |
| --- | ---: | --- |
| Critical | 0 | No confirmed finding in the tested scope |
| High | 2 | Founder poll privacy decision and operational recovery required |
| Medium | 2 | Forward correction and disposable regression supplied |
| Low | 0 | No findings classified at this level |

## P1-01 · Low-count poll inference · High

The effective poll detail projection returns exact aggregate counts for eligible viewers before or after their own ballot while the approved live policy applies. With independently known participation or very small scopes, aggregate changes can disclose individuals' choices or participation by inference. The synthetic poll test shows low-count results and confirms concurrent reads return the same aggregate to an eligible observer without another member's receipt. No raw ballot disclosure was observed. The approved live policy remains in place pending a Founder decision. [Effective projection](../../supabase/migrations/20261124150000_poll_results_during_voting.sql#L19) · [Privacy review and proposed policy options](P1_POLL_PRIVACY_REVIEW.md)

## P1-02 · No verified provider recovery point · High

The read-only hosted backup catalog returned an empty list and PITR disabled. A usable hosted recovery point, independent database and Storage copies, quarantine replay and explicit operating objectives are launch requirements. The disposable logical rehearsal is evidence for the local workflow only. Provider configuration, purchases and recovery tests require separate approval. [Deployment workflow](../deployment/HOSTED_DEVELOPMENT_WORKFLOW.md) · [Recovery boundaries](P1_EVIDENCE_RETENTION_RECOVERY.md)

## P1-03 · Async upload completion validity · Medium

The service-only Feed media finalizer matched its lease identifier and stage but did not independently verify that the lease remained current or that the account could still act. An interrupted or suspended account could therefore leave an upload marked ready after authority changed, although subsequent member publication had its own authorization. The correction rechecks account status and both lease deadlines at the SQL transition. The disposable test covers current, expired, feature-restricted and suspended cases, plus cancellation. [Original service lifecycle](../../supabase/migrations/20261120110000_phase3e_post_media.sql#L73) · [Correction](../../supabase/migrations/20261124154000_p1_media_and_account_audit.sql#L1) · [Disposable test](../../apps/web/e2e/production-readiness.spec.ts)

## P1-04 · Missing proven account-policy links in A1A · Medium

M2.5 stamps policy revisions on account decisions, while the older account-history projection left the authorized A1A source version empty. The correction links a native account decision by its recorded event ID and projects persisted revision values above 1. The database default makes revision 1 ambiguous for older rows, so those and synthetic expiration projections remain unversioned. The policy integration test checks both the corrected version and an ambiguous prior event. [Older projection](../../supabase/migrations/20261123134000_m24_independent_appeals.sql#L555) · [Correction](../../supabase/migrations/20261124154000_p1_media_and_account_audit.sql#L108) · [Policy test](../../apps/web/e2e/moderation-policy.spec.ts)
