# A1A audit integration register

[Open the machine-readable registry](integration-register.json). Each entry identifies required events, native sources, observed coverage, missing events, authorized viewers, excluded fields, associated tests and the responsible remediation phase.

| Status | Interpretation |
| --- | --- |
| covered | Durable native write coverage exists for this module's declared actions |
| partially covered | Only listed writes are durable or only part of the history is projected |
| not covered | No durable event coverage for the declared actions |
| intentionally current-state only | Supported behavior intentionally uses present state or limited receipts |
| gated/not operational | Implementation is subject to a disabled or synthetic-only gate |
| pending policy | The owner or operators still need to decide the required workflow and handling |

Add or update an entry when a protected state-changing operation is created or its authorization, retention, evidence or audit behavior changes. In the feature report, describe the write and its transaction boundaries, event identity, scoped reader, exclusions, retention/deletion/hold behavior, and reconciliation tests. Declare when an adapter is omitted and who owns the decision. Harmless reads, ordinary reactions and transient UI interactions do not require permanent audit rows.

CI checks required fields and test links. Human review still verifies the actual invocation, scope and RLS, transaction and replay behavior, completeness, evidence boundaries, and whether a user can reach the feature through its normal entry point.
