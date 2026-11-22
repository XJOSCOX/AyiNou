# F1 security and authorization

Private routes use random identifiers for routing. Authoritative authorization comes from the secret-first Founder challenge and the protected browser cookie, or from the exact authenticated target, one-time code and recent MFA for appointments. Both use no-store responses, server-side verifiers, bounded attempts and atomic consumption. Audits record events and actor IDs without raw credentials. Issuance intentionally shows the code once to the initiating Founder and does not expose it in profile or audit projections.

The shared governance lock serializes privileged mutations. The Founder proof also checks email provenance and the workflow’s staging profile. O5 approvals still require an eligible approver other than the proposer or target. Username rights, member IDs, independent verification and all four badge meanings remain distinct. Restricted features retain their existing gates.

Storage contains the private workflow relations and an event ledger. Their RLS and grants keep table access away from application roles. Service RPCs receive actor/session proof from Fastify and verify it in PostgreSQL. Expired invitation data is closed and its verifier cleared when observed. Rollout requires an approved retention decision for obsolete workflow metadata and a private delivery process for operators.
