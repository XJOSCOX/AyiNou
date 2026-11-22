# S2B authorization and audit

| Surface | Allowed actors and checks |
| --- | --- |
| Session inventory | Current authenticated member, valid S2A policy, current account eligibility, and verified MFA assurance where applicable. The query selects only their own sessions. |
| Targeted session revocation | The same owner and a different active session scoped through a random management reference. Current leadership additionally requires recent verified TOTP. |
| All-other-session revocation | Ordinary member acts on their own other sessions. Founder and Administrator use the original-session-bound confirmation. |
| Organization draft | Current eligible owner whose exact open intent and any O4 claim target remain in scope. |
| Leadership confirmation | Current eligible Founder or Administrator, exact initiating provider session, fresh verified TOTP and the open, unexpired workflow version. |

The S2A live policy incorporates revocation, so it applies through Next.js, Fastify, protected SQL and applicable Storage checks. Existing F1, O5 and independent verification commands keep their own authority rules. The workflow and audit tables use RLS and no direct application grants. The new RPCs execute only as the service role and recheck the verified actor, live Auth session and command scope. Tests attempt access with the other user's full URL and valid credentials, on both the API and the browser, and verify the authenticated database role cannot execute the gate directly.

Durable events record targeted revocation, all-other revocation, workflow creation, completion and cancellation. Material leadership events record the verified assurance time without the TOTP value. Rows carry an opaque workflow/management reference, actor, action, request reference where applicable, timestamp, version and affected count. Successful changes and their audit commit together. Consistent conflict and permission errors disclose no private metadata. Existing bounded route/status diagnostics cover denials and omit concrete locators, bodies, URLs and tokens. Routine reads and refresh calls produce no durable event.

Account removal cascades workflow rows and clears the actor from the security ledger. There is no member audit export or new policy for evidence holds. Retention durations, deletion exceptions and any future audit viewer are separate decisions.
