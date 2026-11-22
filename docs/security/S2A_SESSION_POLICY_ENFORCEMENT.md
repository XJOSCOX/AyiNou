# S2A session policy enforcement

| Effective session at sign-in | Absolute maximum | Browser credentials |
| --- | --- | --- |
| Recognized Founder | 6 hours | Nonpersistent |
| Administrator | 6 hours | Nonpersistent |
| Ordinary member with Remember This Device checked | 30 days | Persistent until the computed deadline |
| Ordinary member with Remember This Device unchecked | 12 hours | Nonpersistent |

The clock starts at Supabase Auth's `auth.sessions.created_at`. A refresh can rotate credentials for the same session ID while leaving that start intact. Ayinou applies the earlier of its deadline and any provider-enforced `not_after`. Missing or invalid trusted session state fails closed. Browser-close behavior is best-effort. [Supabase session documentation](https://supabase.com/docs/guides/auth/sessions)

The server checks account eligibility, ownership of the session ID and the current effective role. The privileged ceiling is retained once set at sign-in, even when the role is later withdrawn. F1/F1.1 Administrator activation atomically creates a cutoff for sessions established before promotion. The newly appointed member signs in again and verifies MFA before using Administrator actions. Current role checks remove administrative access on revocation. The existing 15-minute action-level TOTP window remains independent of the six-hour ceiling.

Password sign-in may record one preference on its own fresh Auth session within two minutes. Legacy sessions with a trusted start use the unchecked policy. Signup, email confirmation and password recovery use nonpersistent browser cookies. The cookie preference controls browser retention only. App authorization checks the live state in PostgreSQL.

Next.js checks the shared predicate on protected routes. Fastify validates signed Supabase claims and calls the live RPC on protected requests. PostgreSQL applies the same predicate to protected RPCs and direct table access where relevant. Private Storage references remain behind the existing authorized API. A valid provider token can still be refreshable after the Ayinou deadline. Ayinou denies protected use of that refreshed session.

Issue, opt-in, first observed expiry and privileged MFA are bounded per policy. Promotion and revocation record material transitions. No browser preference, device fingerprint, raw provider credential or OTP is stored in the audit ledger.
