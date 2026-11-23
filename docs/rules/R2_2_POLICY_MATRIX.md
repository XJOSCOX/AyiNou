# R2.2 Policy matrix

All six settings share one PostgreSQL revision, one live Founder authorization boundary and one atomic audit transaction. The private ledger records the actual actor, previous and new values, reason, timestamp and request reference. The public projection contains the five flags/mode needed by signup and excludes revisions and private data.

| Key | Type | Default | Effect |
| --- | --- | --- | --- |
| `registration.enabled` | Boolean | ON | All ordinary account creation requires ON |
| `registration.mode` | Enum | `public` | `public` permits both enabled paths, `invitation_only` requires the email/path-bound invitation, and `closed` denies ordinary signup |
| `registration.individual_enabled` | Boolean | ON | Allows the individual path and plain Auth signup with no path metadata |
| `registration.organization_enabled` | Boolean | ON | Allows the organization path with the existing O2 choice capture |
| `referrals.enabled` | Boolean | ON | Allows validation, eligible signup capture and verified confirmation |
| `referrals.rewards_enabled` | Boolean constrained false | OFF | Read-only in the Founder panel. Referral functionality has no reward operation |

| Entry point | Public | Invitation only | Closed or registration disabled |
| --- | --- | --- | --- |
| Ordinary new account, including direct provider signup | Governs enabled signup paths | Same path check plus a valid one-time invitation | Denied |
| Referral link | Optional referral if enabled | Optional referral on otherwise eligible invited signup | Denied |
| Existing account login, recovery, onboarding and organization invitations | Existing authentication and domain policies | Existing authentication and domain policies | Existing authentication and domain policies |
| Reserved Founder signup | Existing private flow with separate proof | Same private flow | Same private flow |

Missing policy fails closed at the API and Auth boundary. Expired or copied invitations cannot create a second account. Invitation consumption rolls back if the Auth transaction fails. A stale admin revision must be reloaded. Repeated identical policy commands return their original receipt; conflicting request IDs are refused.

Existing referral histories, onboarding state, usernames and sessions are preserved. Historical pending referrals may qualify when referrals are enabled and provider evidence is available.
