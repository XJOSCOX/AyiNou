# Founder Verified and regular application resolution

A Founder offer can be opened without any ordinary application. In Verification, the member sees the disclosure choice and the option to authorize closure of their exact pending regular identity application. The initial acceptance binds the application ID and current revision. This opt-in is independent of public gold visibility.

On grant, the existing Founder command and supersession trigger share a transaction and the ordinary review/restriction advisory lock. They recheck the unchanged application, active member, current independent decision, held state and exact opted-in revision. The native grant event and `private.founder_supersession_events` record the result. The close operation stores `closed_by_founder_event_id`, `decided_at` and `superseded_by_founder_verification`. The original application, reviews, reviewer work and evidence references remain under their existing access controls. The member sees the closure reason, and the case leaves the actionable pending queue.

Declined or missing consent, stale revisions, completed reviews and relevant holds preserve ordinary history and eligibility. An independently approved application keeps its status and blue provenance. A subsequent hold or revocation of gold does not reopen a previously closed application. Existing post-grant opt-in remains available to members who later explicitly choose it. Initial opted-in closure requires no later action.

Where ordinary review and Founder grant race, the commit order determines the observed revision and whether the ordinary application is still pending. No synthetic independent approval is written. [Effective closure trigger](../../supabase/migrations/20261121090000_founder_supersession_consent.sql)
