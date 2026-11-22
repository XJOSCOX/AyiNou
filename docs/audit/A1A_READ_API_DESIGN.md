# A1A read API

All six GET routes require a valid Ayinou bearer session, use private no-store responses, and emit no-referrer headers. Platform and verification routes require `X-Ayinou-Workspace` with the corresponding opaque S2C locator. The header and query parameters are excluded from request logs. The API derives the actor, session and authenticator proof from the credential.

| Route | Operation |
| --- | --- |
| `/api/v1/admin/audit/events` | Authorized administration and Founder event page |
| `/api/v1/admin/audit/events/:reference` | One eligible platform event, including Founder-only events only when authorized |
| `/api/v1/me/activity` | Current account's supported activity |
| `/api/v1/institutions/:id/activity` | Active organization's role history |
| `/api/v1/verification/cases/:id/activity` | Assigned ordinary verification case |
| `/api/v1/moderation/:kind/:id/activity` | One general-feed post or comment moderation history |

Lists return `{ version, events, nextCursor }`. Detail returns a versioned event. Allowlisted list filters are `category`, `eventType`, `resourceType`, `resource`, `actor` (platform only), `outcome`, `from`, `to`, `limit` and `cursor`. Dates accept ISO instants with a UTC offset and are compared by timestamp. Send the same filters and limit with the next cursor. Organization scope and review or moderation resource scope are fixed by the route. Domains without adapters have no endpoint or may yield an empty permitted category filter. The response does not attempt an exhaustive history across other modules.

Use a generic 404 for unauthorized scope, unavailable workspace or unavailable detail. Malformed filters and mismatched, expired or altered cursors return the existing `INVALID_INPUT` code. Throttling returns `RATE_LIMITED`. Query failure returns `SERVICE_UNAVAILABLE` without database internals. Existing domain APIs continue to control their own data and action permissions. [Authorization](A1A_AUTHORIZATION_MATRIX.md)
