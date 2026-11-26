# C3 final recovery verification

The recovery rehearsal uses the existing disposable Docker database guard, runs a PostgreSQL custom-format dump, and restores into a temporary database with no connected app. The dump excludes activation readiness and historical disposable enablement rows. The rehearsal checks table fingerprints, migration history, native commitments, consent and stage decisions, invalidated invitations and closed gates. The scratch database is dropped and the in-memory backup is cleared.

The disposable test restored a 3,907,459-byte backup and matched fingerprints on 22 native and C3 tables. It verified that consent withdrawn before backup stayed off, invalidated invitations remained terminal, existing commitments remained and operational gates were closed.

The deployment recovery path is to keep operations closed, retain audit and privacy holds, and make a forward fix to the migration or application. Verification of provider backups, restoration drills, storage and server configuration, and authorized recovery operators remains a public launch prerequisite.
