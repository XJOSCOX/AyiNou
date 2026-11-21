# L5 versioning and source-change design

**DRAFT — NOT APPROVED FOR PUBLICATION**

Each future release record needs `policy_id`, `locale`, `draft_version`, `source_sha256`, `source_commit`, `translation_sha256`, `revision_history`, language and legal `review_status`, independent `approval_status`, `jurisdiction_applicability`, proposed and actual effective dates, superseded version and `publication_state`. Keep draft versions independent of Git commits. A policy can be committed while still unreviewed, unapproved and unpublished. Acceptance tracking belongs to a later separately approved implementation.

When an English clause changes, create a new frozen source manifest. Diff by policy ID and numbered section, record the reason and author, mark corresponding locale drafts **stale**, and attach a version-difference report. A changed section requires new linguistic, legal and product review as applicable; unchanged translations remain traceable to their earlier source. Do not overwrite an approved version. Archive the old text and its approval record, and block stale locale publication. Determine legal notice, reacceptance and effective-date rules only with the owner and qualified counsel. No generic English-controls clause is adopted.

For a future read-only Legal Center, use stable policy and section links, language metadata, keyboard and screen-reader navigation, printable text, clear effective dates, material-change notices and accessible previous versions. That interface and any member acceptance behavior are outside L5.
