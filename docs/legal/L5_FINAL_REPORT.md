# Legal Phase L5 final preparation report

**DRAFT — NOT APPROVED FOR PUBLICATION**

**TRANSLATION DRAFT — QUALIFIED HUMAN AND LEGAL REVIEW REQUIRED**

## Scope and baseline

The verified starting commit was `55bb028ef3ac32ac34f5b420ca008f13c05f51d9` on `origin/main`. L5 prepares working translations and source controls only. It does not adopt, approve, publish or activate policies, signup changes, acceptance controls, real privacy operations or future programs. The final delivery commit and push should be verified in Git history and the handoff report. The work is isolated to legal documents, the roadmap and document-quality scripts. Previously existing unrelated local edits and assets are outside L5.

## Coverage and source controls

The [source manifest](L5_SOURCE_MANIFEST.md) inventories 29 English L4 documents. Ten are prioritized public core or specialized drafts; the [locale directories](locales/) contain all ten in each of Haitian Creole (`ht`), French (`fr`) and Spanish (`es`). Canonical English source files remain in `docs/legal/`. Each translation has a stable document ID, locale, source SHA-256, working version and pending review status. The English source snapshot is tied to the starting Git commit and uses normalized UTF-8/LF hashes for platform-independent verification. The ten public source files contain 64 numbered sections and 37 marked approval/contact placeholders; all 30 translated drafts match their source section IDs and placeholder counts. Subheading, table-row and cross-reference counts also match.

The [four-language glossary](L5_TRANSLATION_GLOSSARY.md) proposes terms for platform versus corporate membership, account authentication versus identity review, informal organizations, founder and identity designations, private votes, project and volunteer roles, data rights and retention. All terms need qualified human and legal approval.

## Review and publication boundary

The [review register](L5_TRANSLATION_REVIEW_REGISTER.md) records every language, English source legal review, jurisdiction review and product review as pending. No reviewer, signature or approval date was invented. Clause-level semantic equivalence, idiom, accessibility and market-specific legal requirements remain human tasks. The [versioning design](L5_VERSIONING_DESIGN.md) describes immutable versions, stale translation marking and clause-difference reports after English edits. The [publication gate](L5_PUBLICATION_READINESS.md) remains closed for operator identity, markets, legal applicability, source approval, translation review, placeholders, contacts, effective dates, provider and privacy readiness, and explicit publication authority.

All 31 open L4 decisions remain in the [approval register](L4_APPROVAL_AND_GAP_REGISTER.md); the [translation gap report](L5_TRANSLATION_GAP_REPORT.md) maps key clauses to them. English is the editorial source, not automatically the controlling published language. Internal governance documents have a pending translation-needs assessment; the future-capabilities annex remains an unimplemented internal proposal. No present-tense product promise is added for individual/organization signup choice, Founder Verified, Early Partners, beneficiary and medical programs, donations, or legal rights operations.

## Validation and limitations

`python scripts/validate-legal-l5.py` passed with ten source documents, 30 target drafts, no missing documents and no structural errors. `python -m py_compile scripts/validate-legal-l5.py scripts/freeze-legal-l5.py` passed. The validator checks source commit hashes, working-source integrity, metadata, numbered section IDs, subsection/table/link counts, placeholders, links and anchors, empty sections and exact copied large English paragraphs. Automated checks cannot prove legal equivalence or completeness of nuanced meaning. The translations are machine-assisted working drafts requiring qualified Haitian Creole, French and Spanish linguistic review, English source legal review, jurisdiction-specific counsel and product review. Application tests were not run because app code, dependencies and migrations were not changed.

One source-control issue was found and corrected before delivery: Windows checkout line endings differed from Git blob line endings. The manifest now hashes normalized UTF-8/LF text and validates those hashes against the source Git commit. No English policy text was rewritten to ease translation. Source questions remain open as mapped in the gap report. L6 public Legal Center work requires a separate owner decision after L5 human review.
