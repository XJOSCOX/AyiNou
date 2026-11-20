# Operational privacy readiness

All launch gates below are open. The owner assigns actual people and their deputies before requesting acceptance. Each gate needs a versioned decision, evidence link and approval date. Keep proof, signed approvals and case records in approved restricted custody.

| Gate | Accountable owner | Evidence required |
| --- | --- | --- |
| Legal operator and nonprofit structure | Project owner and counsel | Identify the actual operator and service authority. Record registration and tax status as supported by official records. Approve governance, conflicts and succession. |
| Privacy contact and support | Privacy lead and security lead | Approve contact, encrypted intake, language coverage, hours, escalation and out-of-band verification. Test notices on a synthetic case without exposing evidence. |
| Subject identity and authorized representatives | Privacy lead and counsel | Approve proof per request and delegation scope, expiration and revocation. Document alternatives where a person cannot sign in. Test impersonation, overbroad delegation and disputed authority. |
| Case staffing and independent appeals | Owner and privacy lead | Train primary and backup reviewers, assign least privilege, record recusal and conflicts, run request and appeal drills and show independent resourcing under absences. |
| Evidence hold authority | Counsel and security lead | Approve reasons, resource scope, review and escalation dates, independent release and overlap handling. Exercise stale resources and evidence custody before approval. |
| Retention and disposal | Counsel, privacy lead and data owners | Approve category, jurisdiction, trigger, duration, exception, hold, action, provider/backup handling and proof per class. Require dated versions and operations sign-off. |
| Jurisdiction and response deadlines | Haiti and US counsel and privacy lead | Approve applicable categories, clocks, extensions, appeals, disclosure exceptions, proof, representation and notice per applicable jurisdiction. Test clock boundaries and unknown rules. |
| KMS and key rotation | Security and infrastructure leads | Approve environment-separated keys, role policies, restore access, key age and retirement, rotation and lost-key procedures. Rehearse recovery, access revocation and audit with synthetic artifacts. |
| Export custody | Privacy and infrastructure leads | Approve field list, subject boundaries, artifact age and usage, encrypted delivery and cleanup verification. Test worst-case size, revoked links, partial production and artifact replacement. |
| Auth and Storage erasure | Infrastructure and data owners | Approve a dependency plan including third-party references and all provider copies where applicable. Test safe ordering, scoped deletion, idempotency and independent per-store read-back. |
| Backup, quarantine and suppression | Infrastructure lead, ledger custodian and independent approver | Register a separately isolated rehearsal and verify signed off-system ledger replay, holds, Auth, Storage hashes, quarantine and release evidence. |
| Incidents, monitoring and alerts | Security lead and on-call owner | Test redacted alert routing for stalled jobs, expired leases, unexpected grants, failed key access, damaged ledgers and quarantined restoration. Run an incident without secret or evidence propagation. |
| User notices | Privacy lead and localization reviewers | Approve in-app and secure alternate delivery, timing and generic out-of-band wording for closures, denials, failed delivery, exceptions and restoration incidents. Verify channels and retry without disclosing case data. |
| Policy translations and accessibility | Qualified language reviewers and accessibility lead | Sign off Haitian Creole, French, English and Spanish legal text and app labels. Test keyboard, focus, content announcements and assistive technology on desktop and mobile. |
| Production and processors | Infrastructure lead, procurement and counsel | Prove approved hosting, access agreements, region, subprocessors, incident terms, backups, recovery capability and egress boundaries for each provider. |
| Pilot eligibility and publication | Owner, counsel and engineering | Approve and test invitation and age controls, translated drafts, actual notices, and release/rollback. Record separate publication and launch approval. |

## Retention approval matrix

Leave every legal duration unresolved until counsel supplies a rule. For each approved rule record effective version, category and geography, trigger, duration, any exception and the decision-maker, legal hold review criteria, action, evidence required and review date. A missing, unknown or conflicting rule stops destructive execution.

| Data classes | Inputs for approval | Proof before enforcement |
| --- | --- | --- |
| Auth credentials, identities, sessions, profile and residence | Proof, account closure and dormant-account triggers, exceptions and operator access | Separate Auth and database projections, metadata, session revocation and provider logs |
| Institutions, groups, invitations, discussions and media | Succession and dependent history; third-party content and shared references | Current roles, scoped dispositions, object paths separately reconciled |
| Reports, appeals, verification and case evidence | Grounds to retain, independently approved holds, expiry reviews and release | Protected views, scope/overlap reconciliation and decision custody |
| Projects, milestones, images and volunteers | Ownership, required historic context, affected people and image references | Database bytes, shared references, retained protected snapshots and evidence |
| Ballots, electorates and aggregates | Choose if and how receipts, actor links and aggregate proof survive | No choice disclosure or reconstruction, independent tally and eligibility checks |
| Export artifacts and event records | Key lifetime, export eligibility, evidence access and audit disposition | Expiration and revocation plus custody, live deletion read-back and independent completion record |
| Backups, provider copies, logs and external evidence | Actual vendor capabilities, approved rotation and preservation exceptions | Separate vendor reconciliation, signed suppression replay, documented residual copies and release approval |

A technical expiry changes eligibility or access. Legal retention determines how long a record is kept. An active hold preserves its scope despite an otherwise applicable rule. Physical removal requires read-back in each covered store. Backup/provider copies follow independently verified procedures. [Policy gap register](POLICY_IMPLEMENTATION_GAP_REGISTER.md) · [Rehearsal](RESTORE_REHEARSAL_RUNBOOK.md)
