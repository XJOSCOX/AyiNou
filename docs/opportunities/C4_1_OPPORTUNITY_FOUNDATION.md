# C4.1 Opportunity foundation

An opportunity has a UUID, organization, current responsible representative, status and exact revision pointer. Each version stores common fields and schema version 1. Fields include title, description, type, language, category, country and optional Haitian department, participation mode, opening and closing dates, versioned skills, official HTTPS references and a future application method. A later phase can add type-specific schemas with separate review.

| Transition | C4.1 behavior |
| --- | --- |
| Create → Draft | Explicitly authorized private preparation only |
| Draft → Draft | New revision with exact expected version |
| Draft → Withdrawn | Terminal decision with preserved snapshot |
| Submitted, Changes requested, Approved, Published, Closed, Restricted, Expired, Archived | Reserved lifecycle states with operational transitions closed |

Haiti uses all ten existing department community identifiers. International opportunities use ISO alpha-2 codes and can be remote, on-site or hybrid. Location is an explicit opportunity field. Opportunity location carries no implication about visa sponsorship or permission to work or travel.

External URLs are bounded HTTPS text and are never fetched. Future external applications require verified destination ownership, explicit user navigation and warnings, a reporting path and re-review when destinations change. Future native expressions of interest need independent purpose consent and strict recipient authorization. Event registration should reference an eligible existing event and use its native visibility, registration, RSVP, capacity, and moderation rules. C4.1 creates no event association.

Catalog linkage records skill code, version and displayed labels at save time. Withdrawn and historical versions preserve the labels used at the time. Private volunteer profiles and volunteer consent are outside these queries. Professional recommendations, applicant disclosure and mentorship must each use independent consent in future work.
