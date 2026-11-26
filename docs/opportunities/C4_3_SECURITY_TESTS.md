# C4.3. Security verification

- Owner routes derive identity from the current application session. Requests have no subject ID or target profile parameter. PostgreSQL binds every read and mutation to that account and the selected mentor or mentee role.
- Tests exercise closed fixture gates, missing or disallowed identity, missing adult and safeguarding confirmations, cross-account access and mutation, account restrictions, stale revisions, exact retries, catalog retirement and explicit imports. The private schema tests require RLS, no direct application grants and a service-only RPC.
- Founder preparation independently requires recognized Founder authority, a recent authenticator confirmation and the originating workspace. Configuration stores no switch for live activation or individual consent, and each update requires the expected revision, explicit confirmation and a reason.
- Hosted verification uses read-only catalog and preservation checks. Enabled workflows and data changes run in disposable Supabase. See [implementation report](C4_3_IMPLEMENTATION_REPORT.md).
