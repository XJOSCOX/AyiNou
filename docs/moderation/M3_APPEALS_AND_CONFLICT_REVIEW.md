# M3 appeals and conflict review

The M2.4 regression exercises account, feature and event appeals through the API against disposable PostgreSQL. It checks the 14-day intake limit, concurrent duplicate receipts, attempts by another account, stale case revisions, assignment restrictions, protected release and assigned reviewer access to appeal statements. Staff audit summaries omit the written narratives and report evidence.

An original decision maker is ineligible for independent review. Event organizer and reporter conflicts are applied at native moderation and appeal review. The tested protected-account path requires an independent finding and a separate eligible Founder release. An organizational conflict blocks that release. A permitted reversal resolves only the referenced current decision, preserves separate sanctions and does not restore a canceled event. An account previously restricted requires fresh authentication after reinstatement.

The original decision state and the reviewer's finding are separate. The database can record a favorable finding with `enforcementChanged: false` when an expired, changed or canceled resource cannot be restored. Treat that field as the restoration outcome. Appeal work changes neither roles nor voting or verification eligibility.

[Appeal decision projection and conflicts](../../supabase/migrations/20261123134000_m24_independent_appeals.sql#L130) · [Atomic reversal](../../supabase/migrations/20261123134000_m24_independent_appeals.sql#L279) · [Disposable coverage](../../apps/web/e2e/enforcement-appeals.spec.ts#L59)
