# C3 final security review

| Boundary | Enforcement |
| --- | --- |
| Founder operations | Recent MFA, original workspace, current session and account, recognized Founder, expected activation revision and exact configuration digest |
| Volunteering | Purpose-specific consent, availability, native standing, project and community authorization, blocks and current evidence |
| Scoped recruitment | Read-only eligibility preview, exact published revision, encrypted session- and opportunity-bound selection, quotas and cooldown |
| Invitation access | Recipient or current native organizer, generic terminal state, minimal notification reference and status |
| Database | Private RLS tables, no direct application-role grants, one service-only activation RPC, native RPC signatures and existing grants |
| Recovery | Restore while isolated, with disposable readiness omitted. Reconcile before exposing any connected service. |

Two Medium findings were corrected. Ambiguous activation history columns prevented the administration read in a fresh database and now use their table alias. An expiry fixture compared a Haitian date to the database date and now uses Haiti-local time. The observed matching and discovery latency was addressed in the same release. A scoped authorization source check prevents preferences or invitation information from crossing accounts or projects. No ranking or invitation availability derives from payments, sponsorship, badges, popularity, protected traits or Founder rank. Database errors are exposed through safe API envelopes with no private evidence in the response. Real launch requires separate approval.

See the [implementation audit](C3_FINAL_IMPLEMENTATION_AUDIT.md) for verification and remaining findings.
