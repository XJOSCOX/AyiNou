# C3.4 Staged activation design

| Stage | Preparation and dependencies | Current live state |
| --- | --- | --- |
| Volunteer profile intake | C3.1 settings and catalog | Closed |
| Structured opportunity requirements | C3.2 settings with catalog and published native project scope | Closed |
| Personalized matching | C3.3 ranking, owner matching consent, current availability and published requirements | Closed |
| Organizer discovery | C3.3 scoped eligibility, separate consent and compatible privacy | Closed |
| Recruitment invitations | C3.4 config, eligible current discovery, recruitment contact opt-in and native Project Work | Closed |
| Public skills disclosure | Requires a future separately approved disclosure design | Unimplemented and closed |

A future C3.5 review can use one Founder workspace with per-stage read-only readiness, explicit activation and independently reversible pauses. Activation should require recent MFA, current policy and dependency checks, role scope, a recorded reason and confirmation, and a durable policy receipt. Pausing outreach should immediately stop sending without removing existing applications, native roles or safeguards. Existing eligible invitations would need an explicit disposition under the approved pause policy. Configuration revisions alone cannot authorize activation, and independent consent and safety checks remain mandatory at every use. Use a bounded cohort rollout and separate approval for public skills or sensitive populations rather than treating them as prerequisites for general volunteer coordination.

C3.4 supports disposable enablement only, with the four fixture tables and local-only API configuration. No hosted Next.js, Fastify, or new infrastructure is needed for the database release.
