# R1 audit summary

**Audited application SHA** `3e03e6d3dbb948a39f49edf6b6b8dbbaf1d0302b`

| Metric | Count and interpretation |
| --- | --- |
| Tracked files examined | 998 enumerated, 981 text files searched, 17 binary assets listed |
| Environment-variable names | 43 names, including runner filters and commented provider templates |
| Logical rules | 94 source-verified semantic records with stable IDs |
| Duplicate enforcement locations | 170 additional mapped non-test source locations after each rule’s first reference. Includes deliberate layers and corroboration; this is not a count of independently confirmed redundant checks. |
| Configurable business candidates | 10 business and 6 operational candidates. No proposed value is approved for editing by this inventory. |
| Protected rules | 35 protected security invariants |
| High-risk governed rules | 13, separate from legal/compliance gates |
| Existing administrative controls | 26 control families grouping related actions or read surfaces |

## Findings and inconsistencies

- **Founder-direct blue is already implemented and deployed.** It records a distinct decision and does not use the two-reviewer threshold. The older authority and verification notes must be read as historical where they describe a mandatory ordinary reviewer assignment for direct decisions.
- **Gold application closure is automatic for eligible pending cases.** The earlier opt-in language predates the current closure migration. The case still requires member consent and account confirmation for gold itself.
- **Blue display and independent eligibility differ.** A Founder-direct blue claim can be visible as Identity Verified. Project and verified-poll eligibility, Founding Ambassadors, protected appointment decisions and O4’s independent route continue to require the existing independent provenance or their separately approved alternative.
- **Authentication context matters.** The app’s password policy includes character classes and a byte ceiling. The tracked provider template and hosted provider controls remain separate. Local email confirmation configuration, the disposable immediate-signup mode and hosted operational settings must not be treated as equivalent.
- **Operational availability is separate from route presence.** Legal release and privacy controls may be reachable to eligible staff while public policy release and real privacy operations stay gated. Early Partners has test and program infrastructure with separate activation.
- **Intentional duplicated checks need one policy contract.** Request content and evidence are validated in both application and SQL. Authorization is rechecked in Fastify and SQL. A future registry can unify approved values without removing defensive enforcement or turning UI copy into authority.

## Highest-risk hardcoded settings

Preserve initial Founder identity and one-time credentials, the six-hour leadership session, recent TOTP and original-session binding, independent identity approval counts, case conflict and holds, gold issuance policy, protected O5 recovery, privacy export key and lifetime, legal release custody and ballot secrecy. Eligibility, role delegation and retention need explicit transitions or separate governance whenever policy changes can affect existing data.

## Recommendation

Start with a typed read-only registry rehearsal against known defaults. Introduce one bounded, owner-approved operational setting after proving shadow parity. Integrate domain settings separately, then governed verification and approval settings with versioned transitions. Keep protected authorization logic, bootstrap, legal release and real privacy in their existing trusted systems. [Architecture](R1_CENTRAL_POLICY_ARCHITECTURE_PROPOSAL.md) · [Migration plan](R1_MIGRATION_DEPENDENCY_PLAN.md)

The owner must approve initial scope, any ordinary-review threshold changes, governed and emergency authority, transition treatment, and policy-history retention. [Decisions](R1_OWNER_DECISIONS.md)

## Verification limits

The hosted development check read only migration and PostgreSQL catalog metadata. It did not inspect provider-side authentication and SMTP settings, infrastructure readiness, actual secrets, identity evidence or policy meaning in live customer records. The name-based routine index cannot prove overload identity, body parity, grants or Data API schema cache. Generated artifacts, external services and binary content were not semantically inspected. File-level test references identify relevant coverage, not a guarantee that every listed policy has a dedicated regression. Controlled follow-up can verify remaining provider and policy evidence.
