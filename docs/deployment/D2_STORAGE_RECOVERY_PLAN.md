# D2 Storage recovery plan

Read-only hosted metadata found three private buckets. No object key, URL, image, restricted attachment or private record was retrieved.

| Asset family | Current boundary | Recovery treatment |
| --- | --- | --- |
| Member images | Private `member-avatars` bucket; 1 object at inspection. Direct client operations are denied. The application controls authorized access. | Copy permitted image bytes under private custody. Reapply bucket restrictions and profile visibility. |
| Feed images | Private `post-media` bucket; 2 objects. Parent post visibility and moderation restrict delivery. | Restore derivatives that still reference an eligible post. Keep private, removed and hidden material unpublished. |
| Institution logos | Private `institution-logos` bucket; 0 objects. Server validates roles, asset type and exposure. | Preserve the ownership and metadata match before exposing the image through the app. |
| Project assets | Project images are database-backed in `private.project_images`; progress assets use the project model. | Include database byte data and related project policy. Reinventory if a future deployment adds an object bucket. |
| Restricted evidence and future confidential documents | No equivalent hosted bucket found in this inventory. Existing restricted evidence references and database records retain their scoped rules. | Approve separate keys, explicit custodians, purpose and retention before onboarding confidential object data. Assess each externally hosted reference separately. |

## Capture and reconcile

- Inventory bucket, restricted object reference, size, MIME type, SHA-256, version or internal identity, read visibility, capture time and reconciliation status. Keep object identifiers, manifests and paths in restricted custody. Use an authorized Storage API or scoped S3-compatible transfer over TLS. Use a bounded or resumable transfer that can report omissions. Never use public signed URLs for backup custody.
- Copy bytes into a restricted encrypted destination separate from production accounts. Where approved, use destination-side versioning or retention protection to survive source deletion. Source S3 compatibility does not provide bucket versioning. Record access, checkpoints and deletion dispositions. Apply an approved retention schedule and retain material subject to active holds in restricted quarantine. [Storage S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility)
- On an isolated target, recreate bucket settings and policies before any import. Keep the app closed. Verify source and destination counts, bytes and SHA-256. Restore data through supported object APIs. Reconcile metadata references, missing files, superseded objects and newer deletion or suppression events. The database `storage` schema stores metadata only. Avoid inserting metadata as a substitute for re-uploading bytes. [Storage schema](https://supabase.com/docs/guides/storage/schema/design)
- Exercise allow and deny reads through direct Storage and application paths. Confirm private objects remain private, verify hold/quarantine processing and require independent approval to release the restored assets. Send alerts for incomplete inventories, checksum mismatches or missing objects. Persist only aggregate diagnostics plus private evidence references.

D2 does not deploy a capture schedule or transfer hosted objects. [Recovery test evidence](D2_RECOVERY_REHEARSAL_REPORT.md)
