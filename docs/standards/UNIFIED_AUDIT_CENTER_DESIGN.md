# Unified Audit Center design

Planned for a later authorized phase. Keep authoritative events in the current domain stores. Each source adapter exposes an allowlisted projection and identifies provenance by source, source ID and native version. Normalize event type, timestamp and scope in projections, without synthesizing missing reasons, outcomes or user IDs. Begin with platform administration, O2 receipts after approval, organization roles and publication controls. Keep voting identity/evidence and privacy evidence outside general adapters.

## Access and query

Build three distinct views with the same filter model: recent-MFA platform review, organization-specific scoped management, and a member's own eligible history. Endpoint authorization resolves scope from live roles and explicit case assignments before filtering, with deny-by-default source permission on each read. Privileged staff must not query a case simply by knowing an actor or target ID. Restrict actor filters and identity fields to the caller’s authority. Keep source evidence in separately assigned workspaces and treat evidence reference resolution as a privileged, separately logged operation.

Use bounded UTC date ranges, category, authorized actor and resource filters. Use keyset pagination ordered by `occurred_at DESC, source_key DESC, source_id DESC` with a signed cursor bound to filter, viewer and scope, plus high-water mark and expiry. Recheck access and holds on every page. Show gaps and source availability without revealing unauthorized counts or private existence. Render structure, prior/result metadata, event origin and retention class in the detail pane. List admin actions, current permitted organization events and the member’s eligible activity in separate projections.

## Throughput, export and assurance

Use backing scope/keyset indexes and capped adapter queries first. For high-volume sources benchmark an index of opaque IDs, type, time and scope only. Rehydrate through current authorization and delete or hold indexes consistently with their sources. Use aggregated counts with visibility thresholds for operational monitoring. Set bounded per-page and export limits. Verify source-dependent costs before introducing a materialized index or queue. Avoid full-table fan-out and record source lag and dropped record counts without sensitive identifiers.

An approved export includes authorized summary projections only. Use scoped time windows, renewed MFA where required, a policy and reason, durable access receipt and a short-lived fulfillment mechanism with independent retrieval authorization. Honor source holds and classification restrictions. No blanket evidence download.

Check missing required events through disposable transaction tests and, if later approved, restricted reconciliation counters for material state transitions. Monitor source coverage, missing adapters, duplicate keys, drift, lag, denied reads and export abuse. Verify tenant isolation and user-only history, recent MFA, stable pagination under churn, redactions and view-versus-evidence permissions before activation. [Audit policy](AUDIT_EVENT_POLICY.md) · [Current coverage](AUDIT_COVERAGE_MATRIX.md).
