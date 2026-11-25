# C1 final development gaps and corrections

| Finding | Correction |
| --- | --- |
| Changing a published-needs directory category during pagination could show results from the old category | Scope base results and pagination state to the active room and filter. Keep results when returning from detail. Retry the failed page in the same category. Verify with the delayed-response browser test and keyboard and accessibility assertions |
| Combined privacy lifecycle test assumed the fixture account was the only eligible Administrator | Determine effective role context from the disposable database, assert the last-Administrator warning exactly when applicable, and always assert the privileged-role blocker. Existing authorization logic stays in place |
| Phase 1A profile SQL fixture assumed a subject claim established an authenticated session | Provision a confirmed disposable identity and bound provider-session row inside the rollback transaction. Assert a subject-only claim fails and scope row counts to the disposable identities |
| Prior C1 evidence was concentrated in Ouest | Run the same full lifecycle in all ten departments and explicitly check cross-department mismatch even when the member belongs to two rooms. Keep test gates separate from live routing |
| Pilot eligibility had separate route and policy proofs | Add a disposable administrator-issued restriction, an ordinary member attempt, a member-browser assertion, durable event checks, and re-enablement after ordinary audited revocation |

The published directory change is an application state fix. Other changes improve repeatability and coverage of existing behavior. No new backend privilege, database migration, live activation or nationwide feature toggle is required. Launch-only gaps are in the [launch dependencies](C1_FINAL_LAUNCH_DEPENDENCIES.md).

No confirmed C1 development defect remains open in the reviewed scope. See the [completion decision](C1_FINAL_COMPLETION_DECISION.md) for evidence and exclusions.
