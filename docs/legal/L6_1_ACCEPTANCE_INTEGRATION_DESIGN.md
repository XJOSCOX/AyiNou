# L6.1 acceptance integration design

Signup currently uses Supabase Auth and does not collect legal acceptance. It remains unchanged. Later signup integration should link to the exact approved Terms, Privacy Policy and Community Guidelines versions and determine applicability by an approved jurisdiction/scope rule. A policy that is unavailable cannot be accepted.

Future records should distinguish contractual acceptance, privacy notice acknowledgment, optional consent and permission for sensitive processing. A record should bind member ID, policy ID, immutable release version and digest, displayed locale, timestamp, applicable scope, event source and minimal audit context. Material changes need an explicit policy-level reacceptance rule and separate notice delivery decision. A new release must not silently reinterpret an old acceptance.

No acceptance table, checkbox, age gate, invitation restriction, migration, fake acceptance history or activation exists in L6.1. L3 real-user privacy intake, export, deletion and retention remain disabled.
