# L5 controlled source inventory

**DRAFT — NOT APPROVED FOR PUBLICATION**

The immutable [machine-readable manifest](locales/manifest.json) freezes 29 English documents at `55bb028ef3ac32ac34f5b420ca008f13c05f51d9`. Each entry records a stable ID, path, SHA-256, source commit, working editorial version, draft status, proposed audience, blockers, source and target locales, translation state, section IDs and unresolved placeholders. The manifest is a translation-coordination snapshot, not an effective policy. [The freeze tool](../../scripts/freeze-legal-l5.py) refuses to overwrite it. A future source revision requires a newly named snapshot and a clause-difference review.

| Class | Documents | Localization decision |
| --- | ---: | --- |
| Public core | 3 | Translate all clauses in `ht`, `fr`, `es` and independently review all four languages. |
| Public specialized | 7 | Translate all clauses in `ht`, `fr`, `es`; Early Partner remains an unimplemented proposal. |
| Future-feature proposal | 1 | Keep internal and explicitly unimplemented; assess translation need before any approved public use. |
| Internal governance | 4 | Do not add automatically to public translations; evaluate if the formed entity needs additional language versions. |
| Editorial/research | 14 | Source-control reference only; do not treat as public terms. |

The ten prioritized public files are the three core policies and Organization & Representative, Project & Volunteer, Voting & Polling, Verification & Badges, Early Partner Program, Cookie & Tracking, and Data Rights & Retention. The canonical English files stay in `docs/legal/`; no duplicate English locale is needed. Locale drafts use the same filename and numbered section ID. Their metadata binds them to the frozen SHA-256. Links back to English internal records identify those records as source references, not approved translated policy pages.

The 31 unresolved decisions remain in the [L4 register](L4_APPROVAL_AND_GAP_REGISTER.md). In particular, legal operator, markets, authoritative versions, language rights, actual effective dates, privacy operations, provider terms, response clocks, retention schedules and contact channels are open. English is the drafting source, not an approved controlling language.
