# Hosted development workflow

Use **Implement → Test → Fix → Deploy to hosted development → Verify → Close phase** for every module. A module owns both its application changes and its required migrations. Keep a blocked migration in the active module. Record the reason and resolve it before starting the next one.

| Stage | Evidence required |
| --- | --- |
| Implement | Identify the phase owner, scope, application entry points, expected database changes, authorization and audit boundaries. Include compatible migrations, tests and recovery procedure in the same phase. |
| Test | Use disposable Supabase for all state-changing tests, including security denials, concurrency, replay, and legacy-data compatibility. Run relevant full regressions, builds and CI for the exact release SHA. |
| Fix | Resolve code, compatibility and migration failures. Rerun impacted tests and CI. Confirm the release SHA includes the tested SQL. |
| Deploy to hosted development | Obtain separate authorization naming the exact project and migration scope. Verify the target, release, current migration history, and fresh dry run. Record data-preservation evidence and feasible recovery. Apply only approved versions in order. Stop if the target, history, security conditions or schema differ. |
| Verify | Confirm migration history and pending files, RLS, grants, proof and role predicates, feature gates, and preserved data/audit fingerprints. Use read-only hosted checks where sufficient. Exercise workflow writes in disposable infrastructure and verify the matching application can connect to the upgraded database. |
| Close phase | Mark **COMPLETE AND DEPLOYED** only after the code and required hosted database changes are verified. Report local, CI and hosted results separately. Identify application hosting as deployed only when a deployment actually occurred. |

Use the project reference as the target identity. The CLI can label the owner-designated development project as production. Run the pinned CLI with the explicit reference and a read-only history check before using any apply command. Recheck pending files after the rollout. A targeted migration approval does not authorize a reset, Auth settings changes, data exports or deletion, enabling restricted features, or launch. Preserve historical decisions, role provenance and audit. Prefer reviewed forward remediation over ad hoc schema or history edits. If a mismatch or failed postflight cannot be safely corrected within the approved scope, hold the module open.

For public launch, separately verify application hosting, Auth and contact/email readiness, protected backups and a tested recovery procedure, staffed operations and legal and privacy decisions. See [engineering standards](../standards/ENGINEERING_STANDARDS.md), [completion checklist](../standards/FEATURE_COMPLETION_CHECKLIST.md), and [recovery readiness](D2_FINAL_READINESS.md).
