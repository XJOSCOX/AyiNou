# P1 historical audit review

| Record class | Reliable relation | Historical exception |
| --- | --- | --- |
| M2.2 account decisions | Native event ID, case, actor, action, timestamp and original request when retained | Older legacy rows may lack a unique event join. Appeal eligibility already requires compatible native provenance. |
| M2.5 account policy | Persisted policy revision above 1 is joined by native account event ID in P1 | Revision 1 is both the backfill default and initial effective revision. Older and initial-version events remain indistinguishable with available evidence. Natural expiration has no authored policy action to infer. |
| M2.3 feature decisions | Native event and case references plus recorded policy field and scope | The initial default field is not proof of a later policy change. Case expiry is a projection of recorded time, not a newly authored decision. |
| M2.4 event moderation | New decisions and reversals carry native report references; only reliable linked events are eligible for that lane | Older events without stored report linkage remain unlinked even if times and subjects match. Hosted aggregate checks currently showed zero linked and zero unlinked event restrictions. |
| M2.4 appeals | Case, original decision, assigned reviewer, decision and restoration outcome | A favorable finding with no restoration remains distinct from an actual sign-in or resource release. |
| Deleted actor or member | Existing keys where retained and allowed | No replacement identity is invented when the source reference has been cleared. |

Hosted preflight observed three native account events with ambiguous revision 1 and zero with a proven later revision. The P1 change is projection-only and leaves these records and original grants untouched. A1A still uses its original private workspace, bounded cursors and reader-specific redactions.

[A1A source inventory](../audit/A1A_SOURCE_INVENTORY.md) · [M2.4 source](../../supabase/migrations/20261123134000_m24_independent_appeals.sql#L466) · [P1 projection](../../supabase/migrations/20261124154000_p1_media_and_account_audit.sql#L108)
