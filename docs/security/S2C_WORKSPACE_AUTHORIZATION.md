# S2C workspace authorization

| Scope | Entry rule | Handling |
| --- | --- | --- |
| Platform Administration | Trusted Founder provenance or active Administrator assignment, live original session and recent TOTP | Private `admin` step. Founder cases, platform governance, administrative settings and legal controls are inside this workspace and keep each action's permissions. |
| Independent verification review and its appeals | Current verification reviewer assignment, verified TOTP and live original session | Private `review` step. Assignment, case conflicts, evidence access and two-reviewer decisions remain enforced by their existing APIs. |
| Feed, department and project moderation and appeals | Existing domain roles and resource checks | Evaluated for future migration. A common link must preserve assignment and community or project scope. Stable entry and existing protection continue in S2C. |
| Restricted privacy review and governance recovery | Separate operational authorization and existing closed gates | S2C grants neither scope nor access. |

The router checks the exact owner and session, resource-specific eligibility, S2A deadline, MFA freshness and the locator state in PostgreSQL for each page entry or close. A locator expires at the earliest of five minutes, the recent TOTP window, a provider deadline and the original S2A lifetime. Existing domain APIs still authorize every request independently. A valid locator conveys no additional role, review assignment or approval.

The S2B private audit ledger records creation and versioned cancellation, including the verified assurance time. Brief repeated opens reuse the live reference without changing its deadline. The owner-row lock prevents concurrent duplicate opens. Creation shares the existing per-account security command budget. Event records omit user or session IDs from the URL and exclude bearer credentials from logs.
