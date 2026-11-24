# P1 poll privacy review

## Observed behavior

- Scheduled polls withhold tallies. When the stored `after_vote` policy is selected, eligible viewers receive exact totals, per-option counts and percentages after opening, including before their own vote. The client refreshes the aggregate and marks a unique leading choice. The server can continue showing live-policy aggregates while awaiting finalization.
- A finalization-only poll withholds results even from a voter who has already received a receipt. After an authorized finalization, readable viewers receive the recorded result. Exact final results can still reveal a choice in very small or widely known electorates.
- The caller's own receipt is separately projected. Same-choice retries return it, while a different choice is rejected under the existing single-ballot rules. Counts change as valid ballots arrive, without a member's ability to revise a recorded selection. Direct ballot and snapshot tables remain private.
- Individual polls require signed-in audience rules. Community reads follow the selected audience and community eligibility. Organization and project polls use their own scoped readers. Organization polls, non-community kinds and governance polls require finalization-only results, verified eligibility and their existing electorate snapshot.
- Outcomes returned by the manager's timeline omit cast-ballot events. Nominee names and handles follow consent, current availability and member block rules. An option's previous public association can still be remembered by viewers even if later consent or visibility changes.

## Inference assessment

Repeated and simultaneous authorized reads of a synthetic live poll confirmed exact totals and low-count changes are observable to viewers who have yet to vote. The synthetic fixture showed a unique lead from a single ballot. In a small or externally known group, this can disclose participation or choice even with no exposed vote row. Larger groups reduce certainty but exact count changes can still be combined with outside knowledge. No real poll activity was used to evaluate this risk.

## Founder options

| Option | Affected experience | Remaining exposure |
| --- | --- | --- |
| Keep live exact aggregates with explicit disclosure | Existing progress bars, counts, polling frequency and leading option continue | Low-count and change inference remain |
| Finalization-only for new scoped advisory polls | During voting, eligible people can use the ballot and see only their own receipt. Remove progress, leading choice and exact totals until finalization. Choose a separate transition for existing open polls. | Exact small final totals remain inferable |
| Approve a minimum result-release count and batch updates | Affects poll detail, bars, leaders, current counts and timers in the same release decision. Threshold, audience, rounding and update cadence must be centrally defined. | Static thresholds alone still expose smaller choices and subsequent changes |
| Keep only an outcome or suppress small results even after close | Affects finalized details, summaries, history, exports and quorum/threshold presentation. Requires a separate decision for project/governance outcome notices. | Outcome or absence of an outcome may imply some facts in known electorates |

Recommend finalization-only for new scoped advisory polls, paired with an explicit small-result policy for finalized displays. Any adoption needs Founder-approved scope, grandfathering and handling for governance decisions. This audit leaves results availability, eligibility, ballots, consent and thresholds unchanged.

[Poll SQL](../../supabase/migrations/20261124150000_poll_results_during_voting.sql) · [Scope and grants](../../supabase/migrations/20261120210000_phase6d_poll_schema.sql#L119) · [Browser and API tests](../../apps/web/e2e/polls.spec.ts) · [Native scoped poll fixture](../../supabase/tests/polls_rollback.sql)
