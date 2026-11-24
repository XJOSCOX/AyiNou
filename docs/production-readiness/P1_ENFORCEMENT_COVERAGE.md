# P1 enforcement coverage

The table maps the current entry families to their authoritative writes and the closest observed baseline assertion. API paths use `/api/v1` unless noted. The protected tables have no ordinary client write path. Where a service worker writes after request authorization, its distinct completion or cleanup boundary is called out.

| Capability | UI and API entry families | Database boundary and nearest verification |
| --- | --- | --- |
| post | Feed composer and post edit, personal/organization social composer, department and group discussion | `create_post_with_media_for_client`, social and scoped post RPCs share post trigger. API denial and allowed personal post after release. |
| comment | Post and focused discussion reply/edit, `/posts/:id/comments`, `/comments/:id` | Native comment writer and parent scope. SQL denial and browser comment flow. |
| reaction | Post and comment reactions through engagement/social handlers | Separate reaction triggers and parent scope. SQL denial and browser positive flow. |
| repost | Social repost and quote composer, `/posts/:id/social`, `/posts/social` | Repost and quote relation triggers. SQL denial and social route positive coverage. |
| follow | Member and institution profiles, follow and approval routes | `write_follow_for_client`, pending follow and membership triggers. API denial alongside unrelated appeal reversal. |
| mention | Post or comment editor in personal, group and organization contexts | Mention resolution and native resolved-target trigger. SQL denial, existing mentions preserved. |
| media | Feed image upload, edit attachment, service upload completion | Upload budget, service reserve/finish, attachment trigger and private bucket. SQL checks current and expired lease, restriction, suspension and cleanup. |
| organization_create | Institution onboarding creation and compatible institution APIs | Native organization insert and onboarding authorization. SQL denial and organization onboarding positive. |
| organization_claim | Institution verification and representative claim | Verification application insert with target organization and live authorization. SQL denial and organization integration positive. |
| organization_publish | Organization composer, post edits and official announcement | Native organization-backed post trigger uses the human author and owning organization. API and SQL denial, positive publication. |
| organization_manage | Workspace representative invite, role, assignment and affiliation commands | Organization invitation, role audit and affiliation event triggers. SQL denial and protected appeal coverage. |
| event_create | Event editor draft creation and publish | `save_event_for_client`, transition and scoped event trigger. SQL denial plus live event regression. |
| event_manage | Event editor change and organizer lifecycle, representatives where authorized | Native event update checks current and changed scope. Safety cancel, completion and independent moderation keep existing rules. SQL denial. |
| event_announce | Event update and Feed share | `announce_event_for_client`, `share_event_for_client`, event update and linked post triggers. API and SQL denial. |
| event_rsvp | Public, member and community event RSVP and updates | `rsvp_event_for_client`, event ancestry and audience; normal withdrawal allowed. API and direct RPC denial, expiry and restore positive. |
| community_create | Community creation and member-group setup | Member group RPC and communities insert trigger. SQL denial plus group positive. |
| community_publish | Department and group composer | Native scoped post trigger enforces community while role and visibility remain independent. SQL denial. |
| group_manage | Group settings, invitations, admission, staff and transfer functions | Native community settings and group audit actions with community scope. SQL denial, existing recovery rules. |
| project_create | Proposal creation, submission, amendment and owner directory publishing | Project status and M3 project events guard; human actor, owning scope and pending revision. SQL and API denial, authorized version changes and unpublish behavior. |
| project_update | Project progress updates, revisions and submission | Native progress entry insert/transition guard. SQL denial and browser positive. |
| volunteer_apply | Project opportunities, applications and withdrawals | Native project operation event for applications. SQL denial and project work positive; withdrawal is independent. |
| project_manage | Project tasks, offers, workflow and opportunity publication actions | Native project operation event and existing scope authorization. SQL denial and Founder-only catalog. |
| poll_create | Poll editor, scoped creation and publication | `poll_save_for_client` and poll transition. Native scoped insert/publication guard. SQL denial, SQL and browser positive. |
| nomination | Poll nominee option setup and consent screens | Option insert guard for nominating; consent replies keep their native lifecycle. SQL denial and scoped poll tests. |
| poll_manage | Poll editor, finalize and governance dispositions | Native poll state and poll decision triggers, existing high-trust authorization. SQL denial; secret ballot and independent eligibility retained. |

Evidence spans each capability at least at a native write boundary. Existing SQL denials are targeted checks, not complete tests of every command, storage provider, stale session, or joint scope. Organization-management, group governance, project management and independent preservation paths require their native privileges. Account restrictions, session expiry and original-workspace binding are separately covered by the account, session and policy suites. Existing recovery, appeals, withdrawal and ballot rules remain independent.

[M3 baseline matrix](../moderation/M3_ENFORCEMENT_COVERAGE.md) · [Guard implementations](../../supabase/migrations/20261123133000_m23_feature_restrictions.sql#L404) · [Feed route modules](../../apps/api/src/modules/feed) · [Feature regression](../../apps/web/e2e/feature-enforcement.spec.ts) · [P1 targeted tests](../../apps/web/e2e/production-readiness.spec.ts)
