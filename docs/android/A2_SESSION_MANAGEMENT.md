# A2 session management

| State | Source | Available action |
| --- | --- | --- |
| Checking | Encrypted restore or explicit revalidation | Wait for bounded requests |
| Signed out | Cold start without a record or a successful local clear | Disposable sign-in when configured |
| MFA | Verified factor from Auth with an AAL1 session | Challenge a selected TOTP authenticator or sign out |
| Onboarding | Fastify member experience denies member access | Save the current required step when permitted |
| Account | Fastify profile and verification reads succeed | View the returned identity, open preferences or sign out |
| Restricted | Self-only Fastify standing response | Read the category or sign out |
| Access unavailable | Fastify returns forbidden | Sign out |
| Sign in again | Session rejection and no active self restriction | Reauthenticate |
| Service unavailable | Network, TLS, rate or server failure | Retry or sign out |

Parallel account work uses one repository mutex. Rotation binds the returned grant to the previous subject and session before committing its ciphertext. The Kotlin check binds transport. Supabase and Fastify make the authoritative access determination. Session revocation and absolute limits survive refresh because Fastify rechecks them. No background job polls or updates account state.

The ViewModel cancels and joins the active request before sign-out. The repository clears local credentials before attempting GoTrue local-scope logout. Offline or unsuccessful logout displays an unconfirmed status. Language and theme persist independently.

Required completion uses the server's ordered profile details contract. Enrollment, invitations, appeals, device administration and legal acceptance have no mobile mutation path in A2.
