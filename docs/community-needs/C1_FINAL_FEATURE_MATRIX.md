# C1 final feature matrix

The SQL entry points below name the **effective** functions. C1.6 overrides earlier intake, review, publication and association bodies in place and retains the C1.5 pagination behavior. C1.7 overrides the internal Pilot dashboard only. The route modules live in `apps/api/src/routes`, shared contracts in `packages/shared/src`, and the corresponding UI modules in `apps/web/src/components`. Test names below refer to the disposable `apps/web/e2e` suites.

| # | Approved capability | API, shared model and browser surface | PostgreSQL enforcement | Exercised status |
| --- | --- | --- | --- | --- |
| 1 | Private needs and drafts | community-needs, CommunityNeed, My community needs and editor | c11_needs_for_api and owner-bound case reads | Draft create and owner read passed. Peers denied |
| 2 | Submission, editing and withdrawal | community-needs, owner case editor | c11_needs_for_api, membership and exact revision checks | State changes and stale/replayed commands tested |
| 3 | Evidence references and original revisions | community-needs / community-needs-review, private author and staff surfaces | c11_validate_content, append-only c11 revisions and scoped c12 projections | Unsafe inputs reject. Original revisions and references stay protected |
| 4 | Community triage | community-needs-review, triage workspace | c12_staff_session, community staff grant and assignment binding | Assigned local triager can refer. Unassigned or unrelated staff denied |
| 5 | Independent evidence review | community-needs-review, NeedReviewCase and verification workspace | c12_granted, c12_staff_case and c12_conflicted | Assigned unconflicted reviewer can accept and decide |
| 6 | Reviewer assignments and conflicts | community-needs-review, admin queue controls | Scoped C1.2 grants, expiry, recusals and case assignment checks | Assignment and staff independence tested |
| 7 | Clarification and correction | community-needs-review, author feedback and correction editor | c12_needs_for_api, expected case and evidence revisions | Clarification and replay-safe author correction tested |
| 8 | Independent challenges | community-needs-review and community-need-publication, case and challenge views | c12_challenges, c13_challenges and independent assigned reviewer | Challenge eligibility, deadline and distinct reviewer tested |
| 9 | Community publication | community-need-publication, author request, reviewer queue, department directory | c13_publication_for_api, community read boundary and exact reviewed version | Request, approve and authorized directory read exercised across all ten |
| 10 | Privacy-safe summaries | community-need-publication and PublishedNeed projection | c13 snapshot validation, source constraints and projection allowlist | Original evidence, review rationale and private data omitted from directory |
| 11 | Attribution and consent | community-need-publication, author attribution controls | Explicit opt-in, current consent and suppression | Default private, explicit consent and withdrawal tested |
| 12 | Community discussion integration | department-communities, needs detail and Discussion composer | Existing member-only department discussion and C1.3 directory access | Shared snapshot reference can be discussed inside each department |
| 13 | Project association requests | need-project-links, project draft and details | c14_links_for_api, native project authority and exact version | Authorized organizer can request. Draft stays governed by native Projects |
| 14 | Author consent and independent association review | need-project-links, member inbox and review workspace | c14 scoped consent, assignments and independence checks | Same lifecycle obtains author consent and distinct reviewer decision |
| 15 | Revocation and invalidation | need-project-links, publication and project surfaces | c14_invalidate and linked visibility projection | Project unpublication, withdrawal and hidden publication clear projections and retain history |
| 16 | Member notices | Notification inbox and private case views | C1 review, publication and link notification triggers and scoped previews | Member events are delivered and private rationale omitted |
| 17 | Feature restrictions | Moderation feature enforcement, account notices and need intake | m23 restrictions and c12 intake guard, c16 eligibility | Scoped restriction and role boundaries exercised |
| 18 | Founder administration | community-needs-pilot and existing Platform Settings | c16_pilot_for_api and private workspace/MFA checks | Authorized Founder settings and ordinary/admin boundaries tested |
| 19 | Participant enrollment | Pilot cohort search, enrollment and roster | c16_eligible, c16_participant, audited bounded policy commands | Scoped enrollment, removal and expiration exercised on disposable data |
| 20 | Pilot capacity and expiration | Pilot configuration and member submission status | c16 capacity lock, rolling count, exact policy and cohort deadlines | Concurrent limit and denial tested |
| 21 | Emergency pause and resumption | Existing Pilot controls | c16 stage checks, independent attestation digest and safe retained reads | Pause blocks new work, safe read/correction/decline preserved, stale evidence blocks resume |
| 22 | Operational readiness and monitoring | Pilot settings, evidence, counters and history | c16_dashboard protected projection, independent custody | Six live attestations outstanding, metadata/status cases tested on disposable data |

Readiness and isolation are enforced server-side. The production routing remains disabled for every stage. Enabling any real pilot requires the separate decisions and evidence recorded in [launch dependencies](C1_FINAL_LAUNCH_DEPENDENCIES.md).
