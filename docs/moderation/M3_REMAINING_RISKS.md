# M3 remaining risks

| Area | Boundary of this audit | Follow-up owner |
| --- | --- | --- |
| Live poll aggregate privacy | The approved aggregate-first presentation was reviewed against live eligibility and private ballot storage. Small-group inference from visible aggregate changes is a product privacy question. Choosing thresholds, aggregation delay or suppression would change approved behavior. | Product and privacy |
| Evidence and retention operations | The audit reviewed live authorization and redaction in the application. It did not exercise operational retention periods, backups, incident response, legal holds or restores against hosted evidence. | Security and privacy operations |
| Alternate integration paths | The coverage table distinguishes native SQL denial assertions from complete API scenarios. It does not establish exhaustive coverage of storage providers, researcher independence across different resource roles, legacy identity records or every mixed-scope combination. | Engineering |
| Historical audit completeness | The new check applies to future writes. Legacy records without a durable source reference remain as recorded. Historic event links and policy revisions were not inferred. | Platform administration |
