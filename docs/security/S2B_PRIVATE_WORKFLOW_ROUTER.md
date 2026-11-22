# S2B private workflow router

A route uses `/s/{flowId}/{step}`. PostgreSQL creates a random UUIDv4 locator. The locator grants no authority. Next.js returns a private, no-store 404 for unavailable links with a no-referrer policy. Fastify verifies the bearer token and SQL verifies the owner, current session, precise step, resource, authority and lifecycle on each read or mutation. The only initial participant is the owner. URL parameters contain no authentication secret, return destination or confidential evidence. Unknown steps, arbitrary redirects and copied locators cannot acquire authority.

| Workflow | Scope and lifecycle |
| --- | --- |
| Organization draft at `resume` | References the member's own O2 intent. An eligible second session for that member may resume. A recorded O4 existing-organization target must remain active and eligible for the existing claim path. The private page hands editing off to the existing organization onboarding screen, whose O2/O4 commands recheck subject, version, authority and identity. Domain cancellation or completion closes the locator in the same database transaction. Link cancellation leaves the draft available through its normal entry point. The link lasts up to seven days. |
| Leadership sign-out at `confirm` | References the owner and exact initiating Auth session. A current Founder or Administrator must have live S2A eligibility and recent verified TOTP at opening, reading and completing. Other sessions for the same account receive the same 404 as other accounts. The link lasts up to five minutes. Its terminal transaction revokes other sessions and records the result. Opening an existing valid link never extends its lifetime. |

Protected operations use server-defined actions and step names. Commands require an expected version and request UUID. An exact replay may receive the same saved receipt while authorization and expiry still permit it. A mismatched replay, expired or revoked session, closed link or stale version cannot repeat the effect. Start a new link from the originating screen when a previous link expires. Existing Founder setup, Administrator activation and MFA callback paths remain supported.

## Platform Administration entry

The follow-up migration `20261121144000_admin_workspace_session_link.sql` adds the `admin` step to the same router. `/admin` returns a 404 for an ordinary authenticated member. A current Founder or Administrator can open an opaque `/s/{flowId}/admin` link after recent verified TOTP. The workspace requires the exact original account and session on every entry. The link ends at the earliest of five minutes, MFA freshness and the existing S2A deadline. Role loss or session revocation prevents reopening. The app uses an uncached response with a no-referrer policy. No user ID, session ID or credential appears in the URL. The existing Admin API independently enforces its own authorization.

The follow-up migration is reviewed in disposable Supabase and requires exact hosted development deployment approval. Other public and signed-in navigation stays on its regular routes.

Expired and closed records remain restricted. Scheduled cleanup, retention durations, and any participant expansion require separate lifecycle and threat review.
