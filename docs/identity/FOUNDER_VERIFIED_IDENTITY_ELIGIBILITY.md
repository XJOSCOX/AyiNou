# Founder Verified identity eligibility

The private `personal_identity_provenance(subject)` returns `independent`, `founder`, both, or neither. Blue comes from the existing reviewed identity claim. Gold requires currently eligible account, trusted Founder issuer, granted and unconflicted case, current consent, an approved live proof record and the recorded member receipt. Disclosure is a separate decision that controls badge visibility. Synthetic evidence remains ineligible. This release adds the helper without replacing any existing product eligibility condition.

| Effective capability | Unverified | Gold only | Blue only | Both | Intended boundary |
| --- | --- | --- | --- | --- | --- |
| Normal account activity, ordinary polls or volunteer actions with no identity gate | Existing role and membership checks | Same | Same | Same | Identity never supplies a role or access assignment. |
| Ordinary non-government organization setup | No | Parity remains closed | Eligible with current setup requirements | Same as blue | First candidate for accepting either provenance through the new helper. Use a dedicated creation-only predicate to avoid changing claims. |
| Existing organization ownership claims and protected organization corrections | No | No | May be eligible | Same as blue | Preserve institutional authority, declaration and independent approval. |
| Individual project submission and publication | Draft only where allowed | Existing independent condition | Eligible with project prerequisites | Same as blue | A future ordinary submission check can accept either provenance only if separated from execution ownership and privileged eligibility. |
| Volunteer managers, supervisors, sensitive tasks and project execution | No when identity required | No when identity required | May be eligible | Same as blue | Roles and sensitive execution remain independently governed. |
| Verified and high-trust polls | No | No | May be eligible | Same as blue | Electorate, ballot privacy and frozen eligibility stay unchanged. |
| Founding Ambassadors | Fails independent identity policy | Same | May be eligible | Same as blue | The program has separate acceptance, visibility and nomination rules. |
| Administrator appointment and governance succession | No | No | May be eligible | Same as blue | F1.1 identity, target acceptance, fresh MFA and governance rules remain. |
| Reviewer, institutional representative, professional or program authority | Separate approval | Separate approval | Separate approval | Separate approval | A personal identity grant conveys no evidence access, role, legal status or credential. |

`project_identity_state` is reused in project execution, verified/sensitive volunteer operations and polls. A blanket replacement would widen all of them. O4 reuses `organization_setup_identity_eligible` for setup, claims and corrections. Use explicit scope-specific checks and lock current evidence at the commit point before adopting gold for ordinary capabilities. Broader project/poll, program and leadership changes require separate policy decisions.

Public Founder, Administrator, blue Identity Verified and gold Founder Verified retain different labels and colors. Holding both identity sources does not create duplicate claims or independent reviewer events.
