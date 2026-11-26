# I1 complete feature inventory

Entries are grouped by product domain. Source links support the delivered scope or show the adjacent implementation for gap entries. The [machine-readable register](I1_FEATURE_REGISTER.json) records per-feature dependencies, test layers, runtime and deployment observations, and the complete route and shared contract inventories. The [launch dependency review](I1_LAUNCH_DEPENDENCIES.md) applies across domains.


## Accounts

### Registration, invitations and referrals

**implemented** · `accounts.registration`

Public, invite-only and closed modes with referral attribution. No reward or payment system.

Supabase Auth, session policies and member profile data. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/register/page.tsx). API and contracts [registration-policy.ts](../../apps/api/src/routes/registration-policy.ts), [accounts.ts](../../packages/shared/src/accounts.ts). SQL [20261122184000_r22_registration_referrals.sql](../../supabase/migrations/20261122184000_r22_registration_referrals.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [members.test.ts](../../apps/api/test/members.test.ts). Browser tests [registration-policy.spec.ts](../../apps/web/e2e/registration-policy.spec.ts), [immediate-signup.spec.ts](../../apps/web/e2e/immediate-signup.spec.ts).

### Member onboarding

**implemented** · `accounts.onboarding`

Resumable account setup, languages, broad location and interests. Private onboarding data has separate disclosure rules.

Supabase Auth, session policies and member profile data. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/onboarding/page.tsx). API and contracts [member-experience-policy.ts](../../apps/api/src/routes/member-experience-policy.ts), [accounts.ts](../../packages/shared/src/accounts.ts). SQL [20261122190000_r23_member_experience.sql](../../supabase/migrations/20261122190000_r23_member_experience.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [members.test.ts](../../apps/api/test/members.test.ts). Browser tests [onboarding.spec.ts](../../apps/web/e2e/onboarding.spec.ts), [member-experience.spec.ts](../../apps/web/e2e/member-experience.spec.ts).

### Personal profiles and avatars

**implemented** · `accounts.profiles`

Public username, avatar and biography with explicit profile publication and privacy controls.

Supabase Auth, session policies and member profile data. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/profile/page.tsx). API and contracts [members.ts](../../apps/api/src/routes/members.ts), [accounts.ts](../../packages/shared/src/accounts.ts). SQL [20261123125400_explicit_profile_publication.sql](../../supabase/migrations/20261123125400_explicit_profile_publication.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [members.test.ts](../../apps/api/test/members.test.ts), [usernames.test.ts](../../apps/api/test/usernames.test.ts). Browser tests [usernames.spec.ts](../../apps/web/e2e/usernames.spec.ts), [f24-social-privacy.spec.ts](../../apps/web/e2e/f24-social-privacy.spec.ts).

### Sign-in, email confirmation and recovery

**implemented** · `accounts.auth`

Supabase Auth, email confirmation and reset. Real deliverability and emergency recovery require operational verification.

Supabase Auth, session policies and member profile data. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/settings/page.tsx). API and contracts [session-security.ts](../../apps/api/src/routes/session-security.ts), [session-security.ts](../../packages/shared/src/session-security.ts). SQL [20261121142000_s2a_session_policy.sql](../../supabase/migrations/20261121142000_s2a_session_policy.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. Browser tests [auth.spec.ts](../../apps/web/e2e/auth.spec.ts), [auth-recovery.spec.ts](../../apps/web/e2e/auth-recovery.spec.ts).

### MFA and session security

**implemented** · `accounts.mfa`

Authenticator step-up, expiration, remembering a device and session controls.

Supabase Auth, session policies and member profile data. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/settings/page.tsx). API and contracts [session-security.ts](../../apps/api/src/routes/session-security.ts), [session-security.ts](../../packages/shared/src/session-security.ts). SQL [20261121143000_s2b_sessions_private_workflows.sql](../../supabase/migrations/20261121143000_s2b_sessions_private_workflows.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. Browser tests [session-security.spec.ts](../../apps/web/e2e/session-security.spec.ts), [session-policy.spec.ts](../../apps/web/e2e/session-policy.spec.ts).

### Privileged and organization workspaces

**implemented** · `accounts.scope`

Scoped switch and step-up for private workflows. Staff enrollment and access reviews remain operational work.

Supabase Auth, session policies and member profile data. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/s/%5BflowId%5D/%5Bstep%5D/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/settings/page.tsx). API and contracts [privileged-setup.ts](../../apps/api/src/routes/privileged-setup.ts), [session-security.ts](../../apps/api/src/routes/session-security.ts), [session-security.ts](../../packages/shared/src/session-security.ts). SQL [20261121144100_s2c_scoped_workspaces.sql](../../supabase/migrations/20261121144100_s2c_scoped_workspaces.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. Browser tests [privileged-setup.spec.ts](../../apps/web/e2e/privileged-setup.spec.ts), [admin-session-link.spec.ts](../../apps/web/e2e/admin-session-link.spec.ts).

### Account access and restriction notices

**implemented** · `accounts.access`

Account access presents applicable restriction details, expiration and appeal paths.

Supabase Auth, session policies and member profile data. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/admin/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/settings/appeals/page.tsx). API and contracts [moderation-center.ts](../../apps/api/src/routes/moderation-center.ts), [enforcement-appeals.ts](../../apps/api/src/routes/enforcement-appeals.ts), [moderation-center.ts](../../packages/shared/src/moderation-center.ts), [enforcement-appeals.ts](../../packages/shared/src/enforcement-appeals.ts). SQL [20261123132000_m22_account_enforcement.sql](../../supabase/migrations/20261123132000_m22_account_enforcement.sql), [20261123134000_m24_independent_appeals.sql](../../supabase/migrations/20261123134000_m24_independent_appeals.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. Browser tests [account-enforcement.spec.ts](../../apps/web/e2e/account-enforcement.spec.ts), [enforcement-appeals.spec.ts](../../apps/web/e2e/enforcement-appeals.spec.ts).

### Homepage community statistics

**implemented** · `accounts.statistics`

Privacy-aware community counts. These counts measure membership activity rather than verified impact.

Supabase Auth, session policies and member profile data. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/page.tsx). API and contracts [homepage-policy.ts](../../apps/api/src/routes/homepage-policy.ts), [core.ts](../../packages/shared/src/core.ts). SQL [20261122183000_r21_homepage_community_statistics.sql](../../supabase/migrations/20261122183000_r21_homepage_community_statistics.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [homepage-policy.test.ts](../../apps/api/test/homepage-policy.test.ts). Database tests [community_aggregation_rollback.sql](../../supabase/tests/community_aggregation_rollback.sql).


## Publishing

### Feed and timelines

**implemented** · `publishing.feed`

Chronological and following views, saved posts and configurable discovery surfaces.

Profile visibility, database RPCs, Storage where applicable, and moderation. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/feed/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/discover/page.tsx). API and contracts [feed.ts](../../apps/api/src/routes/feed.ts), [discovery.ts](../../apps/api/src/routes/discovery.ts), [feed.ts](../../packages/shared/src/feed.ts). SQL [20261120070000_phase3a_text_feed.sql](../../supabase/migrations/20261120070000_phase3a_text_feed.sql), [20261123125100_f24_discovery_timelines.sql](../../supabase/migrations/20261123125100_f24_discovery_timelines.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [feed.test.ts](../../apps/api/test/feed.test.ts). Database tests [feed_rollback.sql](../../supabase/tests/feed_rollback.sql).

### Post authoring and audiences

**implemented** · `publishing.post`

Draft and publish flows, personal and organization authorship and privacy-aware audiences.

Profile visibility, database RPCs, Storage where applicable, and moderation. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/feed/page.tsx). API and contracts [feed.ts](../../apps/api/src/routes/feed.ts), [feed.ts](../../packages/shared/src/feed.ts). SQL [20261123100000_f23_organization_publishing.sql](../../supabase/migrations/20261123100000_f23_organization_publishing.sql), [20261123125300_f24_audience_integrity.sql](../../supabase/migrations/20261123125300_f24_audience_integrity.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [feed.test.ts](../../apps/api/test/feed.test.ts).

### Post images and managed media

**implemented** · `publishing.media`

Post image descriptions and protected media lifecycle. P1 hardens processing against account restrictions and missing leases.

Profile visibility, database RPCs, Storage where applicable, and moderation. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/feed/page.tsx). API and contracts [feed.ts](../../apps/api/src/routes/feed.ts), [feed.ts](../../packages/shared/src/feed.ts). SQL [20261120110000_phase3e_post_media.sql](../../supabase/migrations/20261120110000_phase3e_post_media.sql), [20261124154000_p1_media_and_account_audit.sql](../../supabase/migrations/20261124154000_p1_media_and_account_audit.sql). Effective objects `public.finish_post_upload_for_api`.

Repository test coverage identified. Individual rerun status unverified. P1 disposable rehearsal covered lease and account cases. API tests [post-media.test.ts](../../apps/api/test/post-media.test.ts). Browser tests [feed-media.spec.ts](../../apps/web/e2e/feed-media.spec.ts), [production-readiness.spec.ts](../../apps/web/e2e/production-readiness.spec.ts). Database tests [media_notifications_rollback.sql](../../supabase/tests/media_notifications_rollback.sql). Run evidence [P1_TEST_RESULTS.md](../../docs/production-readiness/P1_TEST_RESULTS.md).

### Comments, reactions and sharing

**implemented** · `publishing.social`

Replies, reactions, saved links, reposts, quotes, mentions and hashtags subject to visibility.

Profile visibility, database RPCs, Storage where applicable, and moderation. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/feed/page.tsx). API and contracts [feed.ts](../../apps/api/src/routes/feed.ts), [feed.ts](../../packages/shared/src/feed.ts). SQL [20261120080000_phase3b_engagement.sql](../../supabase/migrations/20261120080000_phase3b_engagement.sql), [20261123090000_f21_social_interactions.sql](../../supabase/migrations/20261123090000_f21_social_interactions.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [feed.test.ts](../../apps/api/test/feed.test.ts). Browser tests [social-interactions.spec.ts](../../apps/web/e2e/social-interactions.spec.ts). Database tests [engagement_rollback.sql](../../supabase/tests/engagement_rollback.sql).

### Member and institution follows

**implemented** · `publishing.following`

Follow relationships and audience controls. Institutional follow and affiliation have independent semantics.

Profile visibility, database RPCs, Storage where applicable, and moderation. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/discover/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/institutions/page.tsx). API and contracts [discovery.ts](../../apps/api/src/routes/discovery.ts), [institutions.ts](../../apps/api/src/routes/institutions.ts), [feed.ts](../../packages/shared/src/feed.ts), [institutions.ts](../../packages/shared/src/institutions.ts). SQL [20261120090000_phase3c_following_discovery.sql](../../supabase/migrations/20261120090000_phase3c_following_discovery.sql), [20261123125200_f24_followers_audience.sql](../../supabase/migrations/20261123125200_f24_followers_audience.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [feed.test.ts](../../apps/api/test/feed.test.ts), [institutions.test.ts](../../apps/api/test/institutions.test.ts). Browser tests [followed-institutions.spec.ts](../../apps/web/e2e/followed-institutions.spec.ts), [f24-social-privacy.spec.ts](../../apps/web/e2e/f24-social-privacy.spec.ts). Database tests [following_rollback.sql](../../supabase/tests/following_rollback.sql).

### Search and recommendations

**implemented** · `publishing.discovery`

Member, institution, post and hashtag discovery, opt-in recommendations, feedback and visibility filtering.

Profile visibility, database RPCs, Storage where applicable, and moderation. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/discover/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/communities/page.tsx). API and contracts [discovery.ts](../../apps/api/src/routes/discovery.ts), [community.ts](../../apps/api/src/routes/community.ts), [feed.ts](../../packages/shared/src/feed.ts), [communities.ts](../../packages/shared/src/communities.ts). SQL [20261120100000_phase3d_recommendations.sql](../../supabase/migrations/20261120100000_phase3d_recommendations.sql), [20261120150000_phase4c_community_recommendations.sql](../../supabase/migrations/20261120150000_phase4c_community_recommendations.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [community-recommendations.test.ts](../../apps/api/test/community-recommendations.test.ts).

### Notifications and preferences

**implemented** · `publishing.notifications`

In-app notifications across social, program and operational workflows. Delivery channels need individual verification.

Profile visibility, database RPCs, Storage where applicable, and moderation. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/feed/page.tsx). API and contracts [feed.ts](../../apps/api/src/routes/feed.ts), [feed.ts](../../packages/shared/src/feed.ts). SQL [20261120111000_phase3e_notifications.sql](../../supabase/migrations/20261120111000_phase3e_notifications.sql), [20261120162000_phase5a_verification_notifications.sql](../../supabase/migrations/20261120162000_phase5a_verification_notifications.sql).

Feature-specific local execution unverified. Feature-specific run outcome unverified in this inventory.

### Multilingual feed and translation

**partial** · `publishing.translation`

Locale and language filtering plus translation policy controls. Provider configuration and production behavior remain unverified.

Profile visibility, database RPCs, Storage where applicable, and moderation. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/feed/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/onboarding/page.tsx). API and contracts [feed.ts](../../apps/api/src/routes/feed.ts), [member-experience-policy.ts](../../apps/api/src/routes/member-experience-policy.ts), [feed.ts](../../packages/shared/src/feed.ts), [accounts.ts](../../packages/shared/src/accounts.ts). SQL [20261123130200_f25_multilingual_feed.sql](../../supabase/migrations/20261123130200_f25_multilingual_feed.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [feed.test.ts](../../apps/api/test/feed.test.ts). Browser tests [feed-languages.spec.ts](../../apps/web/e2e/feed-languages.spec.ts).

### Mute, block and reporting

**implemented** · `publishing.personal-safety`

Personal safety controls and reporting integrated with feeds and other scoped products.

Profile visibility, database RPCs, Storage where applicable, and moderation. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/account-access/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/feed/page.tsx). API and contracts [safety.ts](../../apps/api/src/routes/safety.ts), [feed.ts](../../apps/api/src/routes/feed.ts), [account-enforcement.ts](../../packages/shared/src/account-enforcement.ts), [feed.ts](../../packages/shared/src/feed.ts). SQL [20261120120000_phase3f_member_safety.sql](../../supabase/migrations/20261120120000_phase3f_member_safety.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [safety.test.ts](../../apps/api/test/safety.test.ts).


## Trust

### Independent personal identity verification

**implemented** · `trust.identity`

Request and restricted reviewer workflow. Evidence handling and staffing gate real processing.

Authorized case reviewers, consent and private evidence handling. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/verification/page.tsx). API and contracts [trust.ts](../../apps/api/src/routes/trust.ts), [verification-policy.ts](../../apps/api/src/routes/verification-policy.ts), [trust.ts](../../packages/shared/src/trust.ts), [verification-policy.ts](../../packages/shared/src/verification-policy.ts). SQL [20261120161000_phase5a_identity_cases.sql](../../supabase/migrations/20261120161000_phase5a_identity_cases.sql), [20261122180000_personal_verification_request_limits.sql](../../supabase/migrations/20261122180000_personal_verification_request_limits.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [trust-routes.test.ts](../../apps/api/test/trust-routes.test.ts). Browser tests [personal-verification-requests.spec.ts](../../apps/web/e2e/personal-verification-requests.spec.ts), [trust-access.spec.ts](../../apps/web/e2e/trust-access.spec.ts). Database tests [verification_trust_rollback.sql](../../supabase/tests/verification_trust_rollback.sql).

### Founder Verified identity

**gated** · `trust.founder-verified`

Candidate consent and gold badge with identity eligibility parity. Issuance depends on authorized actors, policy and step-up. Active hosted settings unverified.

Authorized case reviewers, consent and private evidence handling. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Gated or approval unverified. See I1 launch dependencies.

Web [page.tsx](../../apps/web/src/app/admin/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/verification/page.tsx). API and contracts [founder-identity.ts](../../apps/api/src/routes/founder-identity.ts), [verification-policy.ts](../../apps/api/src/routes/verification-policy.ts), [founder-identity.ts](../../packages/shared/src/founder-identity.ts), [verification-policy.ts](../../packages/shared/src/verification-policy.ts). SQL [20261122160000_fv_operational_issuance_policy.sql](../../supabase/migrations/20261122160000_fv_operational_issuance_policy.sql), [20261123136000_founder_verified_identity_parity.sql](../../supabase/migrations/20261123136000_founder_verified_identity_parity.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [founder-identity.test.ts](../../apps/api/test/founder-identity.test.ts). Browser tests [founder-identity.spec.ts](../../apps/web/e2e/founder-identity.spec.ts).

### Founder direct standard verification

**gated** · `trust.founder-blue`

Bounded Founder-issued standard identity verification under a separate policy. Real issuance depends on authorization and safeguards.

Authorized case reviewers, consent and private evidence handling. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Gated or approval unverified. See I1 launch dependencies.

Web [page.tsx](../../apps/web/src/app/admin/page.tsx). API and contracts [founder-identity.ts](../../apps/api/src/routes/founder-identity.ts), [founder-identity.ts](../../packages/shared/src/founder-identity.ts). SQL [20261122182000_founder_direct_blue_verification.sql](../../supabase/migrations/20261122182000_founder_direct_blue_verification.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [founder-identity.test.ts](../../apps/api/test/founder-identity.test.ts). Browser tests [founder-identity.spec.ts](../../apps/web/e2e/founder-identity.spec.ts).

### Institution verification and impersonation review

**implemented** · `trust.institutions`

Type-specific review, representative checks and impersonation reporting. Requires a staffed review lane and controlled evidence.

Authorized case reviewers, consent and private evidence handling. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/institutions/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/verification/page.tsx). API and contracts [institutions.ts](../../apps/api/src/routes/institutions.ts), [trust.ts](../../apps/api/src/routes/trust.ts), [institutions.ts](../../packages/shared/src/institutions.ts), [trust.ts](../../packages/shared/src/trust.ts). SQL [20261120170000_phase5b_institution_review.sql](../../supabase/migrations/20261120170000_phase5b_institution_review.sql), [20261120171000_phase5b_institution_impersonation.sql](../../supabase/migrations/20261120171000_phase5b_institution_impersonation.sql), [20261123102000_founder_organization_verification.sql](../../supabase/migrations/20261123102000_founder_organization_verification.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [institutions.test.ts](../../apps/api/test/institutions.test.ts), [trust-routes.test.ts](../../apps/api/test/trust-routes.test.ts). Browser tests [institution-verification-requests.spec.ts](../../apps/web/e2e/institution-verification-requests.spec.ts), [founder-organization-verification.spec.ts](../../apps/web/e2e/founder-organization-verification.spec.ts).

### Official badges and custom recognition controls

**implemented** · `trust.recognition`

Official verification and program indicators, plus configurable recognition. Program badges convey their own scope.

Authorized case reviewers, consent and private evidence handling. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/verification/page.tsx), [page.tsx](../../apps/web/src/app/admin/page.tsx). API and contracts [verification-policy.ts](../../apps/api/src/routes/verification-policy.ts), [founder-identity.ts](../../apps/api/src/routes/founder-identity.ts), [verification-policy.ts](../../packages/shared/src/verification-policy.ts), [founder-identity.ts](../../packages/shared/src/founder-identity.ts). SQL [20261122200000_r25_verification_roles_badges.sql](../../supabase/migrations/20261122200000_r25_verification_roles_badges.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [founder-identity.test.ts](../../apps/api/test/founder-identity.test.ts). Browser tests [verification-policy.spec.ts](../../apps/web/e2e/verification-policy.spec.ts).

### Founding Ambassadors

**gated** · `trust.ambassadors`

Private invitation, sender and recipient message, expiration, acceptance and public recognition subject to consent and current policy.

Authorized case reviewers, consent and private evidence handling. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Gated or approval unverified. See I1 launch dependencies.

Web [page.tsx](../../apps/web/src/app/ambassadors/page.tsx). API and contracts [ambassadors.ts](../../apps/api/src/routes/ambassadors.ts), [ambassadors.ts](../../packages/shared/src/ambassadors.ts). SQL [20261120180000_phase5c_ambassadors.sql](../../supabase/migrations/20261120180000_phase5c_ambassadors.sql), [20261124151000_ambassador_invitation_details.sql](../../supabase/migrations/20261124151000_ambassador_invitation_details.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. Browser tests [ambassador-invitation.spec.ts](../../apps/web/e2e/ambassador-invitation.spec.ts). Database tests [ambassadors_rollback.sql](../../supabase/tests/ambassadors_rollback.sql).

### Early partners

**gated** · `trust.partners`

Separate controlled identification and enrollment workflow. Live enrollment and operating authority remain unverified.

Authorized case reviewers, consent and private evidence handling. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Gated or approval unverified. See I1 launch dependencies.

Web [page.tsx](../../apps/web/src/app/admin/page.tsx). API and contracts [early-partners.ts](../../apps/api/src/routes/early-partners.ts), [early-partners.ts](../../packages/shared/src/early-partners.ts). SQL [20261121060000_o6_early_partners.sql](../../supabase/migrations/20261121060000_o6_early_partners.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. Browser tests [early-partners.spec.ts](../../apps/web/e2e/early-partners.spec.ts).


## Institutions

### Organization setup and claim

**implemented** · `institutions.registration`

New and existing institution paths with draft setup, registration declarations and restricted representation flows.

Signed-in accounts, institutional authority and scoped permissions. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/organization-onboarding/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/institutions/page.tsx). API and contracts [organization-onboarding.ts](../../apps/api/src/routes/organization-onboarding.ts), [institutions.ts](../../apps/api/src/routes/institutions.ts), [organization-onboarding.ts](../../packages/shared/src/organization-onboarding.ts), [institutions.ts](../../packages/shared/src/institutions.ts). SQL [20261121020000_o2_organization_intents.sql](../../supabase/migrations/20261121020000_o2_organization_intents.sql), [20261121040000_o4_organization_setup.sql](../../supabase/migrations/20261121040000_o4_organization_setup.sql), [20261123101000_founder_new_organization_setup.sql](../../supabase/migrations/20261123101000_founder_new_organization_setup.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [institutions.test.ts](../../apps/api/test/institutions.test.ts). Browser tests [organization-setup.spec.ts](../../apps/web/e2e/organization-setup.spec.ts), [organization-onboarding.spec.ts](../../apps/web/e2e/organization-onboarding.spec.ts).

### Public profiles, directory and following

**implemented** · `institutions.directory`

Organization identity, handle, logo and profile information with scoped directories and a Following view.

Signed-in accounts, institutional authority and scoped permissions. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/institutions/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/discover/page.tsx). API and contracts [institutions.ts](../../apps/api/src/routes/institutions.ts), [discovery.ts](../../apps/api/src/routes/discovery.ts), [institutions.ts](../../packages/shared/src/institutions.ts), [feed.ts](../../packages/shared/src/feed.ts). SQL [20261120010000_phase2d_institutions.sql](../../supabase/migrations/20261120010000_phase2d_institutions.sql), [20261123124000_institution_list_logos.sql](../../supabase/migrations/20261123124000_institution_list_logos.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [institutions.test.ts](../../apps/api/test/institutions.test.ts). Browser tests [followed-institutions.spec.ts](../../apps/web/e2e/followed-institutions.spec.ts).

### Representation, roles and ownership

**implemented** · `institutions.representation`

Scoped representatives, ownership, custom operational roles and role invitations or expiry.

Signed-in accounts, institutional authority and scoped permissions. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/institutions/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/institutions/%5Bid%5D/roles/page.tsx). API and contracts [institutions.ts](../../apps/api/src/routes/institutions.ts), [organization-roles.ts](../../apps/api/src/routes/organization-roles.ts), [institutions.ts](../../packages/shared/src/institutions.ts). SQL [20261120190000_phase5d_organization_roles.sql](../../supabase/migrations/20261120190000_phase5d_organization_roles.sql), [20261120191000_phase5d_operational_access.sql](../../supabase/migrations/20261120191000_phase5d_operational_access.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [institutions.test.ts](../../apps/api/test/institutions.test.ts). Browser tests [organization-integration.spec.ts](../../apps/web/e2e/organization-integration.spec.ts). Database tests [organization_roles_rollback.sql](../../supabase/tests/organization_roles_rollback.sql).

### Organizational affiliation

**implemented** · `institutions.membership`

Membership invitations, join decisions and history with separate permissions from representation.

Signed-in accounts, institutional authority and scoped permissions. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/institutions/page.tsx). API and contracts [affiliations.ts](../../apps/api/src/routes/affiliations.ts), [institutions.ts](../../packages/shared/src/institutions.ts). SQL [20261120020000_phase2d1_affiliations.sql](../../supabase/migrations/20261120020000_phase2d1_affiliations.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [institutions.test.ts](../../apps/api/test/institutions.test.ts). Browser tests [organization-integration.spec.ts](../../apps/web/e2e/organization-integration.spec.ts). Database tests [affiliations_rollback.sql](../../supabase/tests/affiliations_rollback.sql).


## Communities

### Department spaces and directory

**implemented** · `communities.departments`

Department rooms, opt-in directories, discussions and scoped moderation.

Membership, audience rules and community moderation. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/communities/page.tsx). API and contracts [community.ts](../../apps/api/src/routes/community.ts), [communities.ts](../../packages/shared/src/communities.ts). SQL [20261120130000_phase4a_department_spaces.sql](../../supabase/migrations/20261120130000_phase4a_department_spaces.sql), [20261120131000_phase4a_department_discussions.sql](../../supabase/migrations/20261120131000_phase4a_department_discussions.sql), [20261120132000_phase4a_department_moderation.sql](../../supabase/migrations/20261120132000_phase4a_department_moderation.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [department-communities.test.ts](../../apps/api/test/department-communities.test.ts). Database tests [department_communities_rollback.sql](../../supabase/tests/department_communities_rollback.sql).

### Diaspora and topic groups

**implemented** · `communities.groups`

Public and private groups, joining and invitations, member roles, discussions and moderation.

Membership, audience rules and community moderation. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/communities/page.tsx). API and contracts [groups.ts](../../apps/api/src/routes/groups.ts), [community.ts](../../apps/api/src/routes/community.ts), [communities.ts](../../packages/shared/src/communities.ts). SQL [20261120140000_phase4b_groups.sql](../../supabase/migrations/20261120140000_phase4b_groups.sql), [20261120141000_phase4b_group_membership.sql](../../supabase/migrations/20261120141000_phase4b_group_membership.sql), [20261120142000_phase4b_group_discussions.sql](../../supabase/migrations/20261120142000_phase4b_group_discussions.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [member-groups.test.ts](../../apps/api/test/member-groups.test.ts). Browser tests [group-workflow.spec.ts](../../apps/web/e2e/group-workflow.spec.ts). Database tests [member_groups_rollback.sql](../../supabase/tests/member_groups_rollback.sql).

### Community discovery and memberships

**implemented** · `communities.recommendations`

Recommendations and My Communities support connections across departments and diaspora interests.

Membership, audience rules and community moderation. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/communities/page.tsx). API and contracts [community.ts](../../apps/api/src/routes/community.ts), [communities.ts](../../packages/shared/src/communities.ts). SQL [20261120150000_phase4c_community_recommendations.sql](../../supabase/migrations/20261120150000_phase4c_community_recommendations.sql), [20261120151000_phase4c_my_communities.sql](../../supabase/migrations/20261120151000_phase4c_my_communities.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [community-recommendations.test.ts](../../apps/api/test/community-recommendations.test.ts).


## Events

### Event listing and visibility

**implemented** · `events.discovery`

Upcoming, past, following, community, RSVP and organizing views with signed-in and community audience controls.

Host authority, event visibility and RSVP eligibility. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/events/page.tsx). API and contracts [events.ts](../../apps/api/src/routes/events.ts), [events.ts](../../packages/shared/src/events.ts). SQL [20261123130000_f25_community_events.sql](../../supabase/migrations/20261123130000_f25_community_events.sql), [20261124148000_event_audience_and_community.sql](../../supabase/migrations/20261124148000_event_audience_and_community.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. Browser tests [events.spec.ts](../../apps/web/e2e/events.spec.ts).

### Create, publish and manage events

**implemented** · `events.organizing`

Organizer workspace supports drafts, editing, publishing, cancellation and updates. Organizer badges are read from authorized profile data.

Host authority, event visibility and RSVP eligibility. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/events/page.tsx). API and contracts [events.ts](../../apps/api/src/routes/events.ts), [events.ts](../../packages/shared/src/events.ts). SQL [20261123130100_f25_event_integration.sql](../../supabase/migrations/20261123130100_f25_event_integration.sql), [20261124147000_event_organizer_badges.sql](../../supabase/migrations/20261124147000_event_organizer_badges.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. Browser tests [events.spec.ts](../../apps/web/e2e/events.spec.ts).

### RSVP and participation

**implemented** · `events.rsvp`

Audience and eligibility checks, attendance responses and scoped participant views.

Host authority, event visibility and RSVP eligibility. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/events/page.tsx). API and contracts [events.ts](../../apps/api/src/routes/events.ts), [events.ts](../../packages/shared/src/events.ts). SQL [20261123130000_f25_community_events.sql](../../supabase/migrations/20261123130000_f25_community_events.sql), [20261124148000_event_audience_and_community.sql](../../supabase/migrations/20261124148000_event_audience_and_community.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. Browser tests [events.spec.ts](../../apps/web/e2e/events.spec.ts).


## Projects

### Project drafts and submissions

**implemented** · `projects.proposals`

Individual, community and institutional proposals with owner eligibility and applicable restrictions. Founder Verified satisfies identity checks.

Owner eligibility, project-specific scope and authorized review. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/projects/page.tsx). API and contracts [projects.ts](../../apps/api/src/routes/projects.ts), [projects.ts](../../packages/shared/src/projects.ts). SQL [20261120201000_phase6a_project_workflow.sql](../../supabase/migrations/20261120201000_phase6a_project_workflow.sql), [20261123135000_founder_verified_individual_proposals.sql](../../supabase/migrations/20261123135000_founder_verified_individual_proposals.sql), [20261124153000_m3_project_enforcement.sql](../../supabase/migrations/20261124153000_m3_project_enforcement.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [route-contract.test.ts](../../apps/api/test/route-contract.test.ts). Database tests [projects_rollback.sql](../../supabase/tests/projects_rollback.sql).

### Proposal preview, assignment and decision

**implemented** · `projects.reviews`

Preview before approval, review decisions and change rationale. Founder-owned review is an explicit exception in the proposal workflow.

Owner eligibility, project-specific scope and authorized review. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/projects/page.tsx). API and contracts [projects.ts](../../apps/api/src/routes/projects.ts), [projects.ts](../../packages/shared/src/projects.ts). SQL [20261123137000_founder_own_project_review.sql](../../supabase/migrations/20261123137000_founder_own_project_review.sql), [20261124144000_project_review_preview.sql](../../supabase/migrations/20261124144000_project_review_preview.sql), [20261124145000_project_approval_requires_preview.sql](../../supabase/migrations/20261124145000_project_approval_requires_preview.sql). Effective objects `public.project_review_preview_for_client`, `public.project_review_for_client`.

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [route-contract.test.ts](../../apps/api/test/route-contract.test.ts). Database tests [projects_rollback.sql](../../supabase/tests/projects_rollback.sql).

### Project listing and reapproval

**implemented** · `projects.publication`

Owner-controlled publication, private listing transitions and revised proposal review. Existing public versions follow revision workflow rules.

Owner eligibility, project-specific scope and authorized review. Linked migration versions present in hosted development history. Activation and data behavior are separate. Public Projects route and corresponding API returned HTTP 200. The check did not exercise owner publication. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/projects/page.tsx). API and contracts [projects.ts](../../apps/api/src/routes/projects.ts), [projects.ts](../../packages/shared/src/projects.ts). SQL [20261123138000_project_reapproval_and_publication.sql](../../supabase/migrations/20261123138000_project_reapproval_and_publication.sql), [20261124146000_project_management_publication_status.sql](../../supabase/migrations/20261124146000_project_management_publication_status.sql), [20261124153000_m3_project_enforcement.sql](../../supabase/migrations/20261124153000_m3_project_enforcement.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [route-contract.test.ts](../../apps/api/test/route-contract.test.ts). Database tests [projects_rollback.sql](../../supabase/tests/projects_rollback.sql).

### Project work and team access

**implemented** · `projects.teams`

Approved proposals can activate project work with role-scoped teams, management and invitations.

Owner eligibility, project-specific scope and authorized review. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/projects/%5Bid%5D/work/page.tsx). API and contracts [project-work.ts](../../apps/api/src/routes/project-work.ts), [project-work.ts](../../packages/shared/src/project-work.ts). SQL [20261120204000_phase6b_project_operations.sql](../../supabase/migrations/20261120204000_phase6b_project_operations.sql), [20261120205000_phase6b_operations_workflow.sql](../../supabase/migrations/20261120205000_phase6b_operations_workflow.sql), [20261120206000_phase6b_operations_access.sql](../../supabase/migrations/20261120206000_phase6b_operations_access.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [project-work.test.ts](../../apps/api/test/project-work.test.ts). Browser tests [project-work.spec.ts](../../apps/web/e2e/project-work.spec.ts). Database tests [project_work_rollback.sql](../../supabase/tests/project_work_rollback.sql).

### Volunteer opportunities and applications

**implemented** · `projects.volunteering`

Project-level opportunities, application decisions and participation. Cross-project skills matching remains a separate gap.

Owner eligibility, project-specific scope and authorized review. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/projects/%5Bid%5D/work/page.tsx). API and contracts [project-work.ts](../../apps/api/src/routes/project-work.ts), [project-work.ts](../../packages/shared/src/project-work.ts). SQL [20261120205000_phase6b_operations_workflow.sql](../../supabase/migrations/20261120205000_phase6b_operations_workflow.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [project-work.test.ts](../../apps/api/test/project-work.test.ts). Browser tests [project-work.spec.ts](../../apps/web/e2e/project-work.spec.ts). Database tests [project_work_rollback.sql](../../supabase/tests/project_work_rollback.sql).

### Tasks and contributions

**implemented** · `projects.tasks`

Task assignments, contribution checkpoints and scoped reviews.

Owner eligibility, project-specific scope and authorized review. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/projects/%5Bid%5D/work/page.tsx). API and contracts [project-work.ts](../../apps/api/src/routes/project-work.ts), [project-work.ts](../../packages/shared/src/project-work.ts). SQL [20261120205000_phase6b_operations_workflow.sql](../../supabase/migrations/20261120205000_phase6b_operations_workflow.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [project-work.test.ts](../../apps/api/test/project-work.test.ts). Browser tests [project-work.spec.ts](../../apps/web/e2e/project-work.spec.ts). Database tests [project_work_rollback.sql](../../supabase/tests/project_work_rollback.sql).

### Milestones and progress metrics

**implemented** · `projects.progress`

Project-scoped progress, milestones, metrics and review paths.

Owner eligibility, project-specific scope and authorized review. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/projects/%5Bid%5D/work/page.tsx). API and contracts [project-progress.ts](../../apps/api/src/routes/project-progress.ts), [project-work.ts](../../packages/shared/src/project-work.ts). SQL [20261120207000_phase6c_project_progress.sql](../../supabase/migrations/20261120207000_phase6c_project_progress.sql), [20261120208000_phase6c_progress_workflow.sql](../../supabase/migrations/20261120208000_phase6c_progress_workflow.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [project-progress.test.ts](../../apps/api/test/project-progress.test.ts). Browser tests [project-progress.spec.ts](../../apps/web/e2e/project-progress.spec.ts). Database tests [project_progress_rollback.sql](../../supabase/tests/project_progress_rollback.sql).

### Project evidence and outcome workflow

**implemented** · `projects.evidence`

Project evidence and protected review, outcome and closure flows with eligible aggregate publication. Existing review scope is project-specific.

Owner eligibility, project-specific scope and authorized review. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/projects/%5Bid%5D/work/page.tsx). API and contracts [project-progress.ts](../../apps/api/src/routes/project-progress.ts), [project-work.ts](../../packages/shared/src/project-work.ts). SQL [20261120208000_phase6c_progress_workflow.sql](../../supabase/migrations/20261120208000_phase6c_progress_workflow.sql), [20261120209000_phase6c_progress_access.sql](../../supabase/migrations/20261120209000_phase6c_progress_access.sql), [20261124154000_p1_media_and_account_audit.sql](../../supabase/migrations/20261124154000_p1_media_and_account_audit.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [project-progress.test.ts](../../apps/api/test/project-progress.test.ts). Browser tests [project-progress.spec.ts](../../apps/web/e2e/project-progress.spec.ts). Database tests [project_progress_rollback.sql](../../supabase/tests/project_progress_rollback.sql).


## Voting

### Polls and decision rules

**implemented** · `voting.polls`

Advisory and scoped decision polls, scheduling, audience, eligibility and finalization.

Poll visibility, eligibility and the approved disclosure policy. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/polls/page.tsx). API and contracts [polls.ts](../../apps/api/src/routes/polls.ts), [voting.ts](../../packages/shared/src/voting.ts). SQL [20261120210000_phase6d_poll_schema.sql](../../supabase/migrations/20261120210000_phase6d_poll_schema.sql), [20261120211000_phase6d_poll_workflow.sql](../../supabase/migrations/20261120211000_phase6d_poll_workflow.sql), [20261120213000_phase6f6_poll_scope_listing.sql](../../supabase/migrations/20261120213000_phase6f6_poll_scope_listing.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [polls.test.ts](../../apps/api/test/polls.test.ts). Browser tests [polls.spec.ts](../../apps/web/e2e/polls.spec.ts). Database tests [polls_rollback.sql](../../supabase/tests/polls_rollback.sql).

### Nominations and recommendations

**implemented** · `voting.nominations`

Nominee choices and consent, and scoped recommendation dispositions with project workflow linkage.

Poll visibility, eligibility and the approved disclosure policy. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/polls/page.tsx). API and contracts [polls.ts](../../apps/api/src/routes/polls.ts), [voting.ts](../../packages/shared/src/voting.ts). SQL [20261120211000_phase6d_poll_workflow.sql](../../supabase/migrations/20261120211000_phase6d_poll_workflow.sql), [20261120212000_phase6d_poll_access.sql](../../supabase/migrations/20261120212000_phase6d_poll_access.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [polls.test.ts](../../apps/api/test/polls.test.ts). Browser tests [polls.spec.ts](../../apps/web/e2e/polls.spec.ts). Database tests [polls_rollback.sql](../../supabase/tests/polls_rollback.sql).

### Private ballots and published aggregates

**implemented** · `voting.ballots`

One permitted voter ballot and aggregate disclosure including configured in-progress totals. Exact changes can enable inference in small electorates.

Poll visibility, eligibility and the approved disclosure policy. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/polls/page.tsx). API and contracts [polls.ts](../../apps/api/src/routes/polls.ts), [voting.ts](../../packages/shared/src/voting.ts). SQL [20261120212000_phase6d_poll_access.sql](../../supabase/migrations/20261120212000_phase6d_poll_access.sql), [20261124150000_poll_results_during_voting.sql](../../supabase/migrations/20261124150000_poll_results_during_voting.sql). Effective objects `public.poll_detail_for_client`.

Repository test coverage identified. Individual rerun status unverified. P1 disposable test demonstrated low-count aggregate behavior. API tests [polls.test.ts](../../apps/api/test/polls.test.ts). Browser tests [polls.spec.ts](../../apps/web/e2e/polls.spec.ts), [production-readiness.spec.ts](../../apps/web/e2e/production-readiness.spec.ts). Database tests [polls_rollback.sql](../../supabase/tests/polls_rollback.sql). Run evidence [P1_TEST_RESULTS.md](../../docs/production-readiness/P1_TEST_RESULTS.md).


## Safety

### Reports and evidence routing

**implemented** · `safety.reports`

Domain reporting for social content, communities, events, proposals and impersonation. Moderation scope depends on actor and subject.

Scoped authority, step-up authentication and staffed independent appeal routes. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/account-access/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/feed/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/communities/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/events/page.tsx). API and contracts [safety.ts](../../apps/api/src/routes/safety.ts), [feed.ts](../../apps/api/src/routes/feed.ts), [groups.ts](../../apps/api/src/routes/groups.ts), [events.ts](../../apps/api/src/routes/events.ts), [projects.ts](../../apps/api/src/routes/projects.ts), [institutions.ts](../../apps/api/src/routes/institutions.ts), [account-enforcement.ts](../../packages/shared/src/account-enforcement.ts), [feed.ts](../../packages/shared/src/feed.ts), [communities.ts](../../packages/shared/src/communities.ts), [events.ts](../../packages/shared/src/events.ts), [projects.ts](../../packages/shared/src/projects.ts), [institutions.ts](../../packages/shared/src/institutions.ts). SQL [20261120120000_phase3f_member_safety.sql](../../supabase/migrations/20261120120000_phase3f_member_safety.sql), [20261123131000_m21_moderation_center_reads.sql](../../supabase/migrations/20261123131000_m21_moderation_center_reads.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [safety.test.ts](../../apps/api/test/safety.test.ts).

### Moderation Center and account enforcement

**implemented** · `safety.moderation`

Queues, account and evidence access, restrictions, explanations and reinstatement under role and step-up constraints.

Scoped authority, step-up authentication and staffed independent appeal routes. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/admin/page.tsx). API and contracts [moderation-center.ts](../../apps/api/src/routes/moderation-center.ts), [moderation-center.ts](../../packages/shared/src/moderation-center.ts). SQL [20261123131000_m21_moderation_center_reads.sql](../../supabase/migrations/20261123131000_m21_moderation_center_reads.sql), [20261123132000_m22_account_enforcement.sql](../../supabase/migrations/20261123132000_m22_account_enforcement.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [admin.test.ts](../../apps/api/test/admin.test.ts), [safety.test.ts](../../apps/api/test/safety.test.ts). Browser tests [moderation-center.spec.ts](../../apps/web/e2e/moderation-center.spec.ts), [account-enforcement.spec.ts](../../apps/web/e2e/account-enforcement.spec.ts).

### Feature-specific restrictions

**implemented** · `safety.feature-enforcement`

Scoped actions and delegation limits enforced at applicable mutation points. M3 covers amended project submission and publication.

Scoped authority, step-up authentication and staffed independent appeal routes. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/admin/page.tsx), [page.tsx](../../apps/web/src/app/projects/page.tsx). API and contracts [feature-enforcement.ts](../../apps/api/src/routes/feature-enforcement.ts), [projects.ts](../../apps/api/src/routes/projects.ts), [feature-enforcement.ts](../../packages/shared/src/feature-enforcement.ts), [projects.ts](../../packages/shared/src/projects.ts). SQL [20261123133000_m23_feature_restrictions.sql](../../supabase/migrations/20261123133000_m23_feature_restrictions.sql), [20261124153000_m3_project_enforcement.sql](../../supabase/migrations/20261124153000_m3_project_enforcement.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [safety.test.ts](../../apps/api/test/safety.test.ts). Browser tests [feature-enforcement.spec.ts](../../apps/web/e2e/feature-enforcement.spec.ts).

### Independent appeal workflow

**implemented** · `safety.appeals`

Explanations, appeal submissions and reviewer conflict rules with scoped decisions and history.

Scoped authority, step-up authentication and staffed independent appeal routes. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/settings/appeals/page.tsx), [page.tsx](../../apps/web/src/app/account-access/page.tsx). API and contracts [enforcement-appeals.ts](../../apps/api/src/routes/enforcement-appeals.ts), [safety.ts](../../apps/api/src/routes/safety.ts), [enforcement-appeals.ts](../../packages/shared/src/enforcement-appeals.ts), [account-enforcement.ts](../../packages/shared/src/account-enforcement.ts). SQL [20261120121000_phase3f_appeals.sql](../../supabase/migrations/20261120121000_phase3f_appeals.sql), [20261123134000_m24_independent_appeals.sql](../../supabase/migrations/20261123134000_m24_independent_appeals.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [safety.test.ts](../../apps/api/test/safety.test.ts). Browser tests [enforcement-appeals.spec.ts](../../apps/web/e2e/enforcement-appeals.spec.ts). Database tests [safety_rollback.sql](../../supabase/tests/safety_rollback.sql).

### Founder moderation policy controls

**implemented** · `safety.founder-policy`

Versioned policies, restoration, role and step-up checks, and audited configuration.

Scoped authority, step-up authentication and staffed independent appeal routes. Linked migration versions present in hosted development history. Activation and data behavior are separate. Unsigned API request returned HTTP 401. Authenticated policy changes were not exercised. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/admin/page.tsx). API and contracts [moderation-policy.ts](../../apps/api/src/routes/moderation-policy.ts), [moderation-policy.ts](../../packages/shared/src/moderation-policy.ts). SQL [20261124152000_m25_founder_moderation_policies.sql](../../supabase/migrations/20261124152000_m25_founder_moderation_policies.sql), [20261124154000_p1_media_and_account_audit.sql](../../supabase/migrations/20261124154000_p1_media_and_account_audit.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [admin.test.ts](../../apps/api/test/admin.test.ts). Browser tests [moderation-policy.spec.ts](../../apps/web/e2e/moderation-policy.spec.ts), [production-readiness.spec.ts](../../apps/web/e2e/production-readiness.spec.ts).


## Governance

### Founder and administrator governance

**implemented** · `governance.administration`

Authority assignments, administrative activation and revocation with scoped workspaces and audit records. Staffing and continuity need operating owners.

Founder authority, private sessions and restricted audit access. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/admin/page.tsx), [page.tsx](../../apps/web/src/app/s/%5BflowId%5D/%5Bstep%5D/page.tsx). API and contracts [administration-governance.ts](../../apps/api/src/routes/administration-governance.ts), [privileged-setup.ts](../../apps/api/src/routes/privileged-setup.ts), [administration-governance.ts](../../packages/shared/src/administration-governance.ts), [session-security.ts](../../packages/shared/src/session-security.ts). SQL [20261121050000_o5_administration_governance.sql](../../supabase/migrations/20261121050000_o5_administration_governance.sql), [20261121141000_founder_direct_administrator_appointments.sql](../../supabase/migrations/20261121141000_founder_direct_administrator_appointments.sql), [20261121144100_s2c_scoped_workspaces.sql](../../supabase/migrations/20261121144100_s2c_scoped_workspaces.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [admin.test.ts](../../apps/api/test/admin.test.ts). Browser tests [administration-governance.spec.ts](../../apps/web/e2e/administration-governance.spec.ts). Database tests [admin_rollback.sql](../../supabase/tests/admin_rollback.sql).

### Unified Audit History

**implemented** · `governance.audit`

Private chronological reads, actor and affected member names where authorized, and searchable names or usernames. Cross-domain audit export is a separate gap.

Founder authority, private sessions and restricted audit access. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/admin/page.tsx). API and contracts [audit.ts](../../apps/api/src/routes/audit.ts), [audit.ts](../../packages/shared/src/audit.ts). SQL [20261121145000_a1a_unified_audit_reads.sql](../../supabase/migrations/20261121145000_a1a_unified_audit_reads.sql), [20261124154000_p1_media_and_account_audit.sql](../../supabase/migrations/20261124154000_p1_media_and_account_audit.sql). Effective objects `private.a1a_audit_source`.

Repository test coverage identified. Individual rerun status unverified. P1 disposable tests covered persisted policy revision and ambiguous history. API tests [audit-cursor.test.ts](../../apps/api/test/audit-cursor.test.ts), [admin.test.ts](../../apps/api/test/admin.test.ts). Browser tests [unified-audit.spec.ts](../../apps/web/e2e/unified-audit.spec.ts), [moderation-policy.spec.ts](../../apps/web/e2e/moderation-policy.spec.ts). Run evidence [P1_TEST_RESULTS.md](../../docs/production-readiness/P1_TEST_RESULTS.md).

### Platform configuration

**implemented** · `governance.settings`

Registration, onboarding, verification and badge controls with policy permissions and history.

Founder authority, private sessions and restricted audit access. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/admin/page.tsx), [page.tsx](../../apps/web/src/app/register/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/onboarding/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/verification/page.tsx). API and contracts [admin.ts](../../apps/api/src/routes/admin.ts), [registration-policy.ts](../../apps/api/src/routes/registration-policy.ts), [member-experience-policy.ts](../../apps/api/src/routes/member-experience-policy.ts), [verification-policy.ts](../../apps/api/src/routes/verification-policy.ts), [administration-governance.ts](../../packages/shared/src/administration-governance.ts), [accounts.ts](../../packages/shared/src/accounts.ts), [verification-policy.ts](../../packages/shared/src/verification-policy.ts). SQL [20261122185000_platform_policy_audit_history.sql](../../supabase/migrations/20261122185000_platform_policy_audit_history.sql), [20261122200000_r25_verification_roles_badges.sql](../../supabase/migrations/20261122200000_r25_verification_roles_badges.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [admin.test.ts](../../apps/api/test/admin.test.ts). Browser tests [member-experience.spec.ts](../../apps/web/e2e/member-experience.spec.ts), [verification-policy.spec.ts](../../apps/web/e2e/verification-policy.spec.ts).


## Legal and privacy

### Legal publication

**gated** · `legal-and-privacy.legal`

Policy versions, publication and history controls exist. Applicable documents and approvals require owner and counsel signoff.

Counsel, operating owners, retention, secure evidence and release approval. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Gated or approval unverified. See I1 launch dependencies.

Web [page.tsx](../../apps/web/src/app/legal/page.tsx). API and contracts [legal-publication.ts](../../apps/api/src/routes/legal-publication.ts), [core.ts](../../packages/shared/src/core.ts). SQL [20261121010000_l62a_legal_publication_controls.sql](../../supabase/migrations/20261121010000_l62a_legal_publication_controls.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [legal-publication.test.ts](../../apps/api/test/legal-publication.test.ts). Browser tests [legal-admin.spec.ts](../../apps/web/e2e/legal-admin.spec.ts), [legal-center.spec.ts](../../apps/web/e2e/legal-center.spec.ts).

### Privacy requests and exports

**gated** · `legal-and-privacy.requests`

Intake, export and controlled workflow exist with synthetic restrictions in the verified environment. Real requests require operational authorization and evidence protection.

Counsel, operating owners, retention, secure evidence and release approval. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Gated or approval unverified. See I1 launch dependencies.

Web [page.tsx](../../apps/web/src/app/%28protected%29/settings/privacy-requests/page.tsx). API and contracts [privacy.ts](../../apps/api/src/routes/privacy.ts), [privacy-export.ts](../../apps/api/src/routes/privacy-export.ts), [privacy.ts](../../packages/shared/src/privacy.ts), [privacy-export.ts](../../packages/shared/src/privacy-export.ts). SQL [20261120230000_l32_privacy_intake.sql](../../supabase/migrations/20261120230000_l32_privacy_intake.sql), [20261120231000_l33_privacy_exports.sql](../../supabase/migrations/20261120231000_l33_privacy_exports.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [privacy.test.ts](../../apps/api/test/privacy.test.ts), [privacy-export.test.ts](../../apps/api/test/privacy-export.test.ts). Browser tests [privacy-intake.spec.ts](../../apps/web/e2e/privacy-intake.spec.ts), [privacy-export.spec.ts](../../apps/web/e2e/privacy-export.spec.ts).

### Data retention, holds and deletion

**gated** · `legal-and-privacy.lifecycle`

Lifecycle planning and synthetic execution checks exist. Real retention, obligations and deletion execution require launch decisions.

Counsel, operating owners, retention, secure evidence and release approval. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Gated or approval unverified. See I1 launch dependencies.

Web [page.tsx](../../apps/web/src/app/%28protected%29/settings/privacy-requests/page.tsx). API and contracts [privacy-lifecycle.ts](../../apps/api/src/routes/privacy-lifecycle.ts), [privacy-lifecycle.ts](../../packages/shared/src/privacy-lifecycle.ts). SQL [20261120232000_l34_lifecycle_plans.sql](../../supabase/migrations/20261120232000_l34_lifecycle_plans.sql), [20261120233000_l34_synthetic_holds_and_execution.sql](../../supabase/migrations/20261120233000_l34_synthetic_holds_and_execution.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [privacy-lifecycle.test.ts](../../apps/api/test/privacy-lifecycle.test.ts). Browser tests [privacy-lifecycle.spec.ts](../../apps/web/e2e/privacy-lifecycle.spec.ts).


## Mission gaps

### Structured community needs register

**missing** · `mission-gaps.needs`

No first-class need intake, triage, provenance or reviewed local need record was identified. See proposed C1.

See the mission alignment and recommended sequence for dependencies. No implementation identified. Any linked SQL is adjacent functionality. No per-feature connected behavior verified during I1. Hosted application release unverified. Future scope.

Web [page.tsx](../../apps/web/src/app/%28protected%29/communities/page.tsx), [page.tsx](../../apps/web/src/app/projects/page.tsx). API and contracts [community.ts](../../apps/api/src/routes/community.ts), [projects.ts](../../apps/api/src/routes/projects.ts), [communities.ts](../../packages/shared/src/communities.ts), [projects.ts](../../packages/shared/src/projects.ts).

Feature-specific local execution unverified. Feature-specific run outcome unverified in this inventory.

### Evidence-based public claim verification

**missing** · `mission-gaps.claims`

Identity badges and project evidence workflows exist. No structured fact-check of general public claims was identified.

See the mission alignment and recommended sequence for dependencies. No implementation identified. Any linked SQL is adjacent functionality. No per-feature connected behavior verified during I1. Hosted application release unverified. Future scope.

Web [page.tsx](../../apps/web/src/app/%28protected%29/verification/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/feed/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/projects/%5Bid%5D/work/page.tsx). API and contracts [trust.ts](../../apps/api/src/routes/trust.ts), [feed.ts](../../apps/api/src/routes/feed.ts), [project-progress.ts](../../apps/api/src/routes/project-progress.ts), [trust.ts](../../packages/shared/src/trust.ts), [feed.ts](../../packages/shared/src/feed.ts), [project-work.ts](../../packages/shared/src/project-work.ts).

Feature-specific local execution unverified. Feature-specific run outcome unverified in this inventory.

### Verified need to project traceability

**missing** · `mission-gaps.needs-to-project`

Proposals can describe a problem and link a community. No validated need identifier or authorization-aware linkage was identified.

See the mission alignment and recommended sequence for dependencies. No implementation identified. Any linked SQL is adjacent functionality. No per-feature connected behavior verified during I1. Hosted application release unverified. Future scope.

Web [page.tsx](../../apps/web/src/app/projects/page.tsx). API and contracts [projects.ts](../../apps/api/src/routes/projects.ts), [projects.ts](../../packages/shared/src/projects.ts). SQL [20261120200000_phase6a_project_model.sql](../../supabase/migrations/20261120200000_phase6a_project_model.sql).

Feature-specific local execution unverified. Feature-specific run outcome unverified in this inventory.

### Independent validation of community outcomes

**partial** · `mission-gaps.independent-outcomes`

Scoped project evidence review exists. A cross-community independent outcome certification model with separate conflicts and provenance was not identified.

See the mission alignment and recommended sequence for dependencies. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

Web [page.tsx](../../apps/web/src/app/%28protected%29/projects/%5Bid%5D/work/page.tsx). API and contracts [project-progress.ts](../../apps/api/src/routes/project-progress.ts), [project-work.ts](../../packages/shared/src/project-work.ts). SQL [20261120208000_phase6c_progress_workflow.sql](../../supabase/migrations/20261120208000_phase6c_progress_workflow.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [project-progress.test.ts](../../apps/api/test/project-progress.test.ts).

### Public mission impact dashboard

**missing** · `mission-gaps.impact`

Homepage counts and project outcomes exist. No consolidated, privacy-reviewed outcomes dashboard with traceability was identified.

See the mission alignment and recommended sequence for dependencies. No implementation identified. Any linked SQL is adjacent functionality. No per-feature connected behavior verified during I1. Hosted application release unverified. Future scope.

Web [page.tsx](../../apps/web/src/app/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/projects/%5Bid%5D/work/page.tsx). API and contracts [homepage-policy.ts](../../apps/api/src/routes/homepage-policy.ts), [project-progress.ts](../../apps/api/src/routes/project-progress.ts), [core.ts](../../packages/shared/src/core.ts), [project-work.ts](../../packages/shared/src/project-work.ts). SQL [20261122183000_r21_homepage_community_statistics.sql](../../supabase/migrations/20261122183000_r21_homepage_community_statistics.sql), [20261120209000_phase6c_progress_access.sql](../../supabase/migrations/20261120209000_phase6c_progress_access.sql).

Feature-specific local execution unverified. Feature-specific run outcome unverified in this inventory.

### Volunteer skills and matching

C4.2 extends Opportunity settings with publication policy, staffing plans, geographically scoped reviewers, assignments and reports. The existing verification workspace hosts independent reviews, and the existing organization profile hosts approved listings. The database rollout is verified and live processing remains closed. [C4.2 implementation report](../opportunities/C4_2_IMPLEMENTATION_REPORT.md)

C4.3 reuses this workspace for private mentorship preparation, eligibility and safeguarding limits, and restricted revision history. Members use Account settings or My expressions of interest to reach their private mentorship preferences. [C4.3 implementation report](../opportunities/C4_3_IMPLEMENTATION_REPORT.md)

C4.4 adds bounded mentorship matching, private participant coordination, and Founder preparation of matching considerations and limits. Moderation Reports includes assigned-case triage for mentorship safety reports. Live processing stays closed. [C4.4 implementation report](../opportunities/C4_4_IMPLEMENTATION_REPORT.md)

C4.1 adds Opportunities to organization management and Opportunity settings to Platform Administration → Platform Settings for the recognized Founder. The administrative inventory covers type, organization categories, geography, participation modes, draft limits, readiness and versioned history. [C4.1 implementation report](../opportunities/C4_1_IMPLEMENTATION_REPORT.md)

C3.5 tracks the five implemented volunteer stages, operational readiness, individual enable/pause/resume and emergency pause under Platform Settings → Volunteer settings. The approved database rollout is verified with all five stages disabled. Public skills disclosure remains deferred. [Final implementation audit](../volunteering/C3_FINAL_IMPLEMENTATION_AUDIT.md)

C3.4 adds opportunity invitations to apply, independent recruitment-contact consent, and staged Founder preparation under Platform Settings → Volunteer settings. Hosted schema and connected role access were verified. Live recruitment stays closed. [Implementation report](../volunteering/C3_4_IMPLEMENTATION_REPORT.md)

C3.3 adds private recommendations in volunteer settings, scoped candidate discovery per native opportunity, and Founder preparation for all ten departments under Platform Settings → Volunteer settings. The hosted schema and protected administration access were verified. Live intake, matching, and discovery stay closed. [C3.3 implementation report](../volunteering/C3_3_IMPLEMENTATION_REPORT.md)

C3.2 adds scoped opportunity requirements and revision history in Project Work, plus Founder preparation in Volunteer settings. The hosted operational gate remains closed. [C3.2 implementation report](../volunteering/C3_2_IMPLEMENTATION_REPORT.md)

C3.1 adds the private self-reported profile and a protected Founder workspace under Platform Settings. The Founder can prepare catalog definitions and versions, supported categories and fields, and inspect the local readiness and authorization history. The workspace cannot read individual volunteer profiles or activate intake. [C3.1 implementation report](../volunteering/C3_1_IMPLEMENTATION_REPORT.md)

**partial** · `mission-gaps.volunteer-matching`

Project opportunity discovery and applications are available. C3.1 adds the private skills profile foundation. Cross-project matching and organizer discovery remain future work.

See the mission alignment and recommended sequence for dependencies. No implementation identified. Any linked SQL is adjacent functionality. No per-feature connected behavior verified during I1. Hosted application release unverified. Future scope.

Web [page.tsx](../../apps/web/src/app/%28protected%29/projects/%5Bid%5D/work/page.tsx). API and contracts [project-work.ts](../../apps/api/src/routes/project-work.ts), [project-work.ts](../../packages/shared/src/project-work.ts). SQL [20261120205000_phase6b_operations_workflow.sql](../../supabase/migrations/20261120205000_phase6b_operations_workflow.sql).

Feature-specific local execution unverified. Feature-specific run outcome unverified in this inventory.

### Trusted media and radio

**missing** · `mission-gaps.trusted-media`

Feed images and publishing exist. No first-class station/source registry, curated broadcast schedule or player was identified.

See the mission alignment and recommended sequence for dependencies. No implementation identified. Any linked SQL is adjacent functionality. No per-feature connected behavior verified during I1. Hosted application release unverified. Future scope.

Web [page.tsx](../../apps/web/src/app/%28protected%29/feed/page.tsx). API and contracts [feed.ts](../../apps/api/src/routes/feed.ts), [feed.ts](../../packages/shared/src/feed.ts). SQL [20261120110000_phase3e_post_media.sql](../../supabase/migrations/20261120110000_phase3e_post_media.sql).

Feature-specific local execution unverified. Feature-specific run outcome unverified in this inventory.

### Mentorship, jobs and education opportunities

**missing** · `mission-gaps.opportunities`

Groups, education events and project volunteering exist. Dedicated matching, listings or mentorship workflows were not identified.

See the mission alignment and recommended sequence for dependencies. No implementation identified. Any linked SQL is adjacent functionality. No per-feature connected behavior verified during I1. Hosted application release unverified. Future scope.

Web [page.tsx](../../apps/web/src/app/%28protected%29/communities/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/events/page.tsx), [page.tsx](../../apps/web/src/app/%28protected%29/projects/%5Bid%5D/work/page.tsx). API and contracts [community.ts](../../apps/api/src/routes/community.ts), [events.ts](../../apps/api/src/routes/events.ts), [project-work.ts](../../apps/api/src/routes/project-work.ts), [communities.ts](../../packages/shared/src/communities.ts), [events.ts](../../packages/shared/src/events.ts), [project-work.ts](../../packages/shared/src/project-work.ts).

Feature-specific local execution unverified. Feature-specific run outcome unverified in this inventory.

### Financial contributions and transparency

**missing** · `mission-gaps.finance`

Project contributions track work. No payment, donation, ledger, reconciliation or public financial statement workflow was identified.

See the mission alignment and recommended sequence for dependencies. No implementation identified. Any linked SQL is adjacent functionality. No per-feature connected behavior verified during I1. Hosted application release unverified. Future scope.

Web [page.tsx](../../apps/web/src/app/%28protected%29/projects/%5Bid%5D/work/page.tsx). API and contracts [project-work.ts](../../apps/api/src/routes/project-work.ts), [project-progress.ts](../../apps/api/src/routes/project-progress.ts), [project-work.ts](../../packages/shared/src/project-work.ts).

Feature-specific local execution unverified. Feature-specific run outcome unverified in this inventory.

### Mobile and low-bandwidth access

**partial** · `mission-gaps.mobile-web`

Responsive web and performance safeguards exist. No native application, offline queue or end-to-end low-bandwidth readiness evidence was found.

See the mission alignment and recommended sequence for dependencies. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

API and contracts [status.ts](../../apps/api/src/routes/status.ts), [core.ts](../../packages/shared/src/core.ts). SQL [20261120102000_optimize_recommendation_rank.sql](../../supabase/migrations/20261120102000_optimize_recommendation_rank.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [status.test.ts](../../apps/api/test/status.test.ts).


## Operations

### Hosted web and API release

**gated** · `operations.web-release`

Source and connected local runtime exist. Hosted application release and deployed configuration remain unverified.

Hosting, release owner and verification against the actual environment. Linked migration versions present in hosted development history. Activation and data behavior are separate. Connected local web and API returned HTTP 200 within the read-only postflight. Hosted application release unverified. Gated or approval unverified. See I1 launch dependencies.

API and contracts [status.ts](../../apps/api/src/routes/status.ts), [core.ts](../../packages/shared/src/core.ts). SQL [20261124154000_p1_media_and_account_audit.sql](../../supabase/migrations/20261124154000_p1_media_and_account_audit.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [status.test.ts](../../apps/api/test/status.test.ts).

### Production Auth and email operations

**gated** · `operations.delivery`

Recovery and verification flows exist. Auth redirect configuration, SMTP deliverability and operational recovery require documented verification.

Hosting, release owner and verification against the actual environment. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Gated or approval unverified. See I1 launch dependencies.

Web [page.tsx](../../apps/web/src/app/%28protected%29/settings/page.tsx). API and contracts [session-security.ts](../../apps/api/src/routes/session-security.ts), [session-security.ts](../../packages/shared/src/session-security.ts). SQL [20261121142000_s2a_session_policy.sql](../../supabase/migrations/20261121142000_s2a_session_policy.sql).

Feature-specific local execution unverified. Feature-specific run outcome unverified in this inventory.

### Provider backup and recovery

**gated** · `operations.recovery`

Disposable rehearsal exists. Provider evidence showed no listed restore points and PITR disabled. Hosted restoration was unproven.

Hosting, release owner and verification against the actual environment. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Gated or approval unverified. See I1 launch dependencies.

API and contracts [status.ts](../../apps/api/src/routes/status.ts), [core.ts](../../packages/shared/src/core.ts). SQL [20261124154000_p1_media_and_account_audit.sql](../../supabase/migrations/20261124154000_p1_media_and_account_audit.sql).

Feature-specific local execution unverified. Feature-specific run outcome unverified in this inventory.

### Operational health and observability

**partial** · `operations.monitoring`

Health and error-reporting surfaces exist. Deployed alerting, on-call ownership and production incident drills were unverified.

Hosting, release owner and verification against the actual environment. Linked migration versions present in hosted development history. Activation and data behavior are separate. No per-feature connected behavior verified during I1. Hosted application release unverified. Public launch remains gated.

API and contracts [status.ts](../../apps/api/src/routes/status.ts), [core.ts](../../packages/shared/src/core.ts). SQL [20261120122000_phase3f_operations.sql](../../supabase/migrations/20261120122000_phase3f_operations.sql).

Repository test coverage identified. Individual rerun status unverified. Feature-specific run outcome unverified in this inventory. API tests [status.test.ts](../../apps/api/test/status.test.ts), [upstream-failures.test.ts](../../apps/api/test/upstream-failures.test.ts).

## C2 development closure evidence

C2 covers exact-source requests, independent findings and challenges, consented result publication, measurement mapping and governed Impact reports. C1 associations and native Project Work remain authoritative for their own records. The [capability and integration audit](../project-outcomes/C2_FINAL_IMPLEMENTATION_AUDIT.md) records current coverage, production database verification, and gated behavior. The [C2 completion decision](../project-outcomes/C2_FINAL_COMPLETION_DECISION.md) distinguishes verified development from live launch readiness. The [C2.6 administrative inventory](../project-outcomes/C2_6_CONFIGURATION_ACTIVATION_SEPARATION.md) records access to configuration, draft definitions, rosters, staffing plans and oversight history while live processing is closed.
