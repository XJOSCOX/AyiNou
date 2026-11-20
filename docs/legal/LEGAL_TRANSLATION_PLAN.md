# Ayinou legal translation and version plan

**DRAFT — NOT APPROVED FOR PUBLICATION**

English (`en`) is the working drafting source. The application also supports Haitian Creole (`ht`), French (`fr`) and Spanish (`es`). The owner and counsel must decide which legally applicable versions to offer and any rules for resolving discrepancies. Keeping one editing source helps coordinate changes. It does not settle the authority of translated legal text or override mandatory language rights. [Decision L1-17](POLICY_DECISIONS.md#l1-17-language-authority) · [Market review](INTERNATIONAL_LEGAL_REVIEW.md)

## Approval workflow

1. **Freeze the working source.** Assign a document ID, release version and hash or controlled snapshot. Remove editorial notes and placeholders only after resolution. Record the counsel-reviewed source, markets, effective date proposal, product evidence, and whether the document is a notice, an agreement or a scoped consent.
2. **Brief qualified humans.** Engage translators fluent in the target legal register and intended region, with Haitian Creole expertise for `ht`. Supply approved source, clause intents, stable section IDs, legal-market notes, interface terms, audience scenarios and approved glossary. Give them sanitized materials. Real verification or support cases are unnecessary for translation.
3. **Review independently.** A second language specialist reviews meaning, idiom and accessibility. Qualified counsel or a supervised legal-language reviewer checks each locale against applicable local rules and the exact source, especially eligibility, consent, rights, governing law, exceptions, privacy and emergency processes. Have product verify the named controls and safety workflows. Machine output, translation memory and back-translation can support review.
4. **Test and approve as a release set.** Verify placeholders, correct accents and HTML language tags, links, stable section IDs, headings, mobile readability, keyboard and screen-reader use, printable text, effective dates and prior-version access. Approvers sign off the package with locale, source version, localized version, review record, markets and publication timing.
5. **Resolve discrepancies.** Provide a route to report an unclear translation in the applicable language. Triage differences affecting an agreement or a right with qualified reviewers. Restrict reliance on disputed text when advised, prepare matched corrections, record who was affected, and provide appropriate notices. Use a version fallback only where the approved market rule permits and the fallback is clear.

## Terminology to standardize

The glossary documents concepts and UI references. The listed translations are proposed working terms subject to human approval.

| Concept | Haitian Creole | French | Spanish | Meaning to carry across languages |
| --- | --- | --- | --- | --- |
| Platform member | Manm platfòm nan | Membre de la plateforme | Miembro de la plataforma | Application account holder. Keep separate from statutory nonprofit membership. |
| Verified identity | Idantite verifye | Identité vérifiée | Identidad verificada | A specific review status. Keep separate from MFA, authority and truth of statements. |
| Authorized representative | Reprezantan otorize | Représentant autorisé | Representante autorizado | Scoped authority for a given institution. A directory listing or affiliation is a separate concept. |
| Advisory poll | Sondaj konsiltatif | Sondage consultatif | Encuesta consultiva | Community input with no official election authority. |
| Private ballot | Bilten vòt prive | Bulletin de vote privé | Papeleta privada | Scoped read and processing. Do not substitute “anonymous” if a recorded link exists. |
| Appeal | Rekou | Recours | Recurso | Request to review an eligible decision. Distinguish from a report, a general complaint and a new application. |
| Data deletion | Efase done | Suppression de données | Eliminación de datos | Approved removal action. Distinguish account closure, visibility expiry, physical erasure and de-identification. |
| Preservation hold | Prezèvasyon tanporè | Gel de conservation | Conservación temporal | Purpose-limited preservation with approval, scope and review. |

## Version and notice governance

Keep immutable, readable prior versions by document ID, locale, release version and jurisdiction where relevant. Include the source release/hash, translation review date, source and localized approvals, effective date, superseded version, reason, public URL once released, actual notification record and affected audience. Keep any future acceptance record purpose-limited and tied to the exact text/version and locale presented, using a separately approved product design. Avoid unreachable archive links or silently replacing older versions.

For substantive changes, map impacts, obtain renewed legal and linguistic review, test notices in applicable locales, approve timing and audience, and release matched versions or hold the affected market. For typographical corrections, document the correction and preserve the prior artifact. Follow counsel's direction on whether a change is substantive, what notice is needed and when fresh acceptance is required. Archive what was communicated and provide accessible access to the applicable versions. [Owner approval brief](OWNER_DECISION_BRIEF.md) · [Implementation gates](LEGAL_IMPLEMENTATION_PLAN.md)
