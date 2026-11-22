# F1 Administrator appointment and activation

The recognized Founder creates an O5 appointment for the exact target UUID and records a written reason. The target needs an active independently verified identity and verified TOTP. The Founder then issues the private invitation from the appointment row. The single privileged response shows the opaque invitation URL and the 256-bit code. Send them separately through a verified private channel. The operator can revoke the invitation from the same appointment row.

The invitation can wait for approval. A distinct active administrator must approve the O5 proposal using the existing conflict declaration and recent MFA. The target must sign in to their own account, complete recent TOTP, enter the code at `/activate/a/{id}` and accept the responsibilities. The transaction rechecks both actors, the governance version and approval, the target’s eligibility, expiry and the verifier. Role assignment, acceptance and audit commit together. An expired, revoked, locked or consumed code cannot activate a role.

An installation with one Founder and no other eligible administrator leaves appointments pending. The generic O5 execution and succession gates remain closed. The new route executes only the independently approved Administrator appointment. The green badge follows the ordinary active platform role projection.
