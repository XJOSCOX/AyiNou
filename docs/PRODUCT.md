# Product Scope and Roles

## North star

Enable people in Haiti and the global Haitian diaspora to connect and collaborate on peaceful, verifiable improvements to Haitian communities.

## Core users

- **Member:** Can register, join discussions, share ideas, submit proposals, contribute time/skills, and report content.
- **Group moderator:** Applies transparent community rules within assigned group(s).
- **Project organizer:** Coordinates approved projects, responsibilities, milestones, and progress updates.
- **Verified notable individual:** Account identity/notability has been checked; still follows member rules.
- **Verified organization/station:** Legal or operational affiliation confirmed, with separate authorized representatives.
- **Platform reviewer:** Reviews verification applications, content/claims with conflict-of-interest rules and audit logging.
- **Administrator:** Minimal privileged access with strong authentication and oversight.

Verification does not elevate voting privileges or make a person's statements automatically credible.

## Launch experience

Membership is open to Haitians, including the diaspora, and international supporters. Members choose a self-declared category during onboarding. First and last names are private. Members choose a public username and may add a biography, photo, residence, or interests. They can resume from the last saved stage and preview which fields may be published.

New visitors start in Haitian Creole and can switch to French, English, or Spanish. Members can save their language preference during onboarding or in My Profile. The interface language leaves their community content and profile text as entered.

The current member dashboard presents privacy-filtered community statistics. Account Settings groups personal and public profile editing, privacy preferences, recovery and authenticator controls, the private member reference, and referrals. Members can share an invitation link. A new member may use one code at signup, with attribution confirmed after email confirmation and a signed-in request. Referrals carry no payment, reward, role, or badge.

## Dashboard terminology

- `Registered members`: non-deleted user accounts, excluding known spam/test accounts in production metrics.
- `Active members`: distinct members with a defined qualifying activity within a documented rolling window (definition decided in Phase 2).
- `Members living in Haiti`: users who voluntarily self-declare Haiti as country of current residence.
- `Department residents`: subset of the above who share a department; NOT a census, and NOT user geolocation.
- `Diaspora members`: members who self-declare current residence outside Haiti.
- `Unknown`: users who withhold location or have incomplete data.

## Public figures and ambassadors

Invite media hosts, musicians, artists, athletes, educators, business/community leaders, and others from varied regions. Invitations and platform amplification must follow objective, documented, nonpartisan standards. Authenticity verification should be distinct from being selected as an ambassador.

Future identity verification will use time-bound proof of control through an approved channel. Proof supports a verification application. Badge approval requires a separate authorized review. Supabase sign-in MFA only protects account access.

Haitian and international organizations, NGOs, businesses, schools, media, and government institutions can create an AyiNou institutional profile. One person may represent multiple institutions through their own login. A profile can be published with an unverified label while its identity awaits review. A person claiming an institution must submit official references for independent ownership review. Institutions can invite members to defined roles and set a term where appropriate. Neither an invitation nor an accepted claim awards identity or institution verification.

Members can submit a manual application for personal identity, public-figure status, an organization, a government institution, or a representative position. AyiNou accepts links to official public sources. Do not submit government IDs or private evidence files. The workspaces and personal profile editor adapt to phones and use the available width above the mobile breakpoint.

People can manage one institution and belong to others as members, volunteers, staff, or supporters. An ordinary affiliation shows how the person joined, such as a direct join, manager approval, or invitation. It does not establish verified employment or authority to act for the institution. Institutions choose whether to list active members publicly. A member must separately consent to listing their display name and affiliation type.

## User safety

The signed-in feed lets members publish short text updates, choose an audience, and maintain private drafts. Posts display in chronological order. Members can report visible posts by others. Authorized moderators can hide, restore, remove, or close reports with a written reason. Reports remain pending until reviewed, and formal appeals remain future work.

Platform administrators can search a minimal account projection, investigate impersonation using public identifiers, and record account restrictions with an audit reason. Verification reviewers use a separate workspace for assigned work, public references, written decisions, and revocation. Both workspaces require recent authenticator verification. Members can manage their password and authenticator or sign out of all Supabase sessions from account settings.

- Enforce anti-harassment, anti-threat and anti-impersonation rules.
- Provide blocking/muting, accessible reporting, takedown review and appeals.
- For fires, security incidents and vulnerable-person reports, avoid publishing actionable live location details by default.
- Do not imply Ayinou replaces emergency response or emergency services.
- Establish governance for verification disputes, misinformation appeals, and public corrections before the claim-verification module launches.

## Success metrics

Initial local testing covers the interface in four languages, access control, onboarding, and responsive layouts. After safe launch, measure retained members, diversity of department participation, verified projects completed, volunteer hours, and documented outcomes.
