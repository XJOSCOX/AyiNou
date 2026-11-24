# M3 enforcement coverage

The registry contains 25 capabilities. Evidence groups below identify the closest exercised boundary. **API** means a real disposable API or authenticated RPC action. **SQL** means a transactional write-denial assertion using the native trigger; it covers that boundary rather than every normal application path. Some rows have both.

| Capability | Observed safeguard | Evidence |
| --- | --- | --- |
| post | Authenticated personal post denied while restricted and allowed after release. | API |
| comment | Parent post scope | SQL |
| reaction | Target reaction scope | SQL |
| repost | Source post scope | SQL |
| follow | Follow denied while an unrelated post restriction is reversed. | API |
| mention | Resolved recipient and parent scope | SQL |
| media | Upload initialization | SQL |
| organization_create | Organization creation boundary | SQL |
| organization_claim | Representative or claim application boundary | SQL |
| organization_publish | Authenticated organization publishing and organization post boundary | API, SQL |
| organization_manage | Native organization invitation boundary and protected restriction appeal | SQL, API |
| event_create | Creation guard and delegated authority duration | SQL, API |
| event_manage | Organizer edit boundary | SQL |
| event_announce | Native update and authenticated event sharing | API, SQL |
| event_rsvp | Organization-scoped RSVP checks in Fastify and authenticated RPC, plus withdrawal and expiry | API |
| community_create | Community creation boundary | SQL |
| community_publish | Community post boundary | SQL |
| group_manage | Native group invite audit boundary | SQL |
| project_create | Project creation, ordinary and amended review submission, directory publication | SQL, API |
| project_update | Project progress write boundary | SQL |
| volunteer_apply | Application operation boundary | SQL |
| project_manage | Task creation operation boundary and Founder-only management catalog | SQL, API |
| poll_create | Poll creation boundary and public poll lifecycle | SQL, API |
| nomination | Nominee option insertion | SQL |
| poll_manage | Native poll decision boundary and protected authority | SQL, API |

The restricted subject remains able to cast an otherwise eligible ballot, withdraw permitted RSVPs and use account recovery and appeal surfaces. The same catalog does not establish end-to-end positive and negative coverage for every variant, especially alternate media/storage states, consent changes and owner-recovery operations.

References: [Capability catalog](../../supabase/migrations/20261123133000_m23_feature_restrictions.sql#L1), [transaction guards](../../supabase/migrations/20261123133000_m23_feature_restrictions.sql#L404), [feature test](../../apps/web/e2e/feature-enforcement.spec.ts#L53), [appeal test](../../apps/web/e2e/enforcement-appeals.spec.ts#L59), [project acceptance](../../apps/web/e2e/founder-identity.spec.ts#L1340).
