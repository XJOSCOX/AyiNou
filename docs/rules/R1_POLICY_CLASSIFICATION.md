# R1 policy classification

| Category | Treatment and examples |
| --- | --- |
| ENV_SECRET | Keep credentials, signing material and encryption keys in deployment secret custody. Publish identifiers and handling rules only. |
| ENV_DEPLOYMENT | Keep listen origins, provider endpoints, deploy-specific integration identifiers, infrastructure flags and build inputs out of the policy panel. |
| PANEL_BUSINESS_POLICY | Candidate for typed/versioned owner configuration within validated envelopes. Examples include eligible content rules and bounded product quotas. |
| PANEL_OPERATIONAL_SETTING | Candidate for controlled live operations, such as bounded abuse budgets. Require review of resource/security impact and owner authorization before migration. |
| PROTECTED_SECURITY_INVARIANT | Retain in code/database authorization. Examples include trusted Founder provenance, live sessions, private workspace binding, conflict restrictions, ballot privacy and write atomicity. |
| GOVERNED_HIGH_RISK_POLICY | Separate approval pathway with immutable audit, explicit effective time and workflow transition. Examples include review thresholds, standing gold issuance and protected eligibility. |
| DOMAIN_SCOPED_POLICY | Keep with the owning domain and its native permissions unless registry integration has an explicit ownership contract. |
| LEGAL_OR_COMPLIANCE_GATE | Keep existing legal release and privacy operational gates under separate approval. The panel may expose permitted read status later. |
| TECHNICAL_CONSTANT | Keep code-level bounds, query timeouts, pagination structure and implementation choices under engineering review. No workflow meaning should be inferred solely from a literal. |
| TEST_ONLY | Disposable fixtures and commands use test gates and distinct evidence. Never promote synthetic overrides to central live policy. |
| HISTORICAL_OR_DEPRECATED | Keep migration and decision history. Follow current ordering and SQL wrapper lineage when auditing enforcement. |
| UNRESOLVED | Owner or provider evidence is missing, or impact is unclear. Do not assign an active default based on a template or a fixture. |

The catalog assigns one primary category per logical rule. Each specific environment name is separately catalogued, so a deployment secret, a related feature gate and its behavior can have different ownership. A proposed category does not confer an existing edit privilege. Treat all proposed migrations as gated until the owner accepts the [decisions](R1_OWNER_DECISIONS.md).
