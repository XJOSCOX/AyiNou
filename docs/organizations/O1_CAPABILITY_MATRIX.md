# O1 capability matrix

The table describes proposed O4 behavior for new onboarding. Existing authorized relationships are assessed separately. FV means an active Founder Verified grant with account control and no hold. IV means current independently reviewed personal identity. Each capability still has its own scope and live restrictions.

| Capability | Eligible member, neither designation | FV | IV | Additional gate |
| --- | --- | --- | --- | --- |
| Ordinary member actions | Yes | Yes | Yes | Existing personal account, profile and safety rules |
| Private organization draft | Yes | Yes | Yes | Only the authenticated subject’s intent |
| Complete new ordinary organization setup | No | Proposed yes | Yes | Authority evidence and declaration, organization risk rules and no duplicate |
| Manage established organization | With existing authorized relationship | Same | Same | Live owner or delegated permission; badge alone grants no membership |
| Publish ordinary organization profile | Through preexisting eligible relationship | Through eligible relationship | Through eligible relationship | Completed setup and profile safety/visibility checks; institutional verification optional |
| Apply for organization verification | Existing eligible owners only | Eligible owner may apply | Eligible owner may apply | Effective verification RPC and independent review; government rules separate |
| Submit organization project | No | No via FV alone | Conditional | Current identity, permission and project workflow; organization verification required for public progression |
| Publish organization project | No | No via FV alone | Conditional | Current reviewed submitter identity, verified organization, independent project approval and visibility restrictions |
| Vote | Active polls if eligible | Same | Includes eligible verified polls | Scope, electorate and one ballot per personal Auth account |
| Volunteer coordination | Existing permitted roles | Same | May qualify for reviewed-identity roles | Project execution rules, consent, scope and sensitive task checks |
| High-trust institutional representation | No FV/IV substitution | No FV substitution | May qualify | Current reviewed/approved representative relationship and organization safeguards |

## SQL change inventory for later implementation

- **Change in O4:** enforce a narrowly named prospective `private.organization_setup_identity_eligible` in the create branch of Phase 5D `public.institution_save_for_api` and the new completion RPC. At minimum include independently reviewed identity or approved FV with live account and no hold. For a new claim, recheck in the `claim` branches of effective Phase 5B `verification_submit_for_api` and `verification_decide_for_api`. Preserve distinct independent claim approvals and leave personal, government, organization and representative review branches on their existing eligibility rules unless separately approved. Scope new issuance rules to new actions, not a destructive ownership backfill.
- **Registration and publication impact:** changes to public profile fields or visibility require auditing `private.institution_view`, `public.institution_public_for_api`, `private.institution_review_snapshot`, `public.search_discovery_for_client`, institution follow/report lookups and logo projections. Keep observed material identity locks in `institution_save_for_api`.
- **Preserve independent-only boundaries:** `private.reviewed_personal_claims`, the public verification projection, Phase 5A admin promotion RPC and Phase 5C `private.ambassador_public_eligible`. Never append FV to the reviewed claims array. A future expansion of reviewed-only privileges would require its own policy and targeted SQL review, including feed/discovery projections and badge history.
- **Projects:** preserve Phase 6A.1 `private.project_identity_state`, `project_require_identity`, `project_organization_verified`, `project_visible`, `project_submit_for_client`, `project_review_for_client` and current detail/options affordances (including Phase 6B replacements). Organization drafts are distinct from submission. Review Phase 6B `project_executable`, `project_execution_owner`, `project_execution_role`, `project_task_visible` and live manager/supervisor or sensitive-task mutations if a future phase requests parity. O1 proposes none.
- **Polls:** preserve Phase 6D `poll_scope_live`, `poll_can_organize`, `poll_scope_member` and `poll_live_eligible`, verified ballot checks in the workflow, scoped options and the ballot uniqueness constraint `(poll_id,voter_id)`. Community participation and organization/project management rights are separate from casting ballots. Higher-trust polls use stricter reviewed identity and scope requirements. Any future organization consultation should use a separate decision model with explicit delegate and organization-level attribution, independent of personal polls.
- **Representatives:** preserve Phase 5B reviewed membership evidence, expiration, revoked status and consent, as well as Phase 5D `institution_role` and `organization_has_permission` scope. A change in FV status should disable future gated commands and open review of exceptional risks while an existing affiliation, contract or team is resolved through its own workflow.

The owner’s compatibility proposal is limited to ordinary organization setup. Eligibility, governance and partner enrollment remain separate as described in the [owner decision brief](O1_OWNER_DECISION_BRIEF.md).
