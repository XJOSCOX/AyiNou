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

Members can open a post’s comments, add a text comment or reply, and react with Like, Love, Support, or Celebrate. Existing replies stay readable under a generic unavailable marker if the root comment is removed. Accounts can report visible comments to moderators. Reactions count engagement and carry no role, verification, or ranking effect.

Discover connects members to public people and institutions. Following is voluntary and one-way. The Following tab shows chronological personal posts from eligible followed accounts. Institutional follows live alongside membership without changing a member’s institutional permissions.

For You is optional. Members can choose topics, see why a post appeared, hide recommendations, and reset their feedback. Latest and Following remain chronological. Verification badges show account verification status, and account popularity carries limited weight in recommendations.

Members can attach and reorder up to four still images on a post or draft and write optional descriptions. Post images follow the audience and moderation state of the post. The member inbox covers reactions to posts, comments, replies, and new personal followers. Members can mark alerts read and choose which events generate future alerts in Account Settings. Unavailable activity displays a generic notice.

## Dashboard terminology

- `Registered members`: non-deleted user accounts, excluding known spam/test accounts in production metrics.
- `Active members`: distinct members with a defined qualifying activity within a documented rolling window (definition decided in Phase 2).
- `Members living in Haiti`: users who voluntarily self-declare Haiti as country of current residence.
- `Department residents`: subset of the above who share a department; NOT a census, and NOT user geolocation.
- `Diaspora members`: members who self-declare current residence outside Haiti.
- `Unknown`: users who withhold location or have incomplete data.

## Public figures and ambassadors

The Founding Ambassador program recognizes voluntary contributions to peaceful collaboration. Selection considers constructive work, rule compliance, respect for safety and privacy, relevant experience, and accurate representation of the role. Ayinou welcomes a range of communities and professions using documented, nonpartisan criteria. Participation comes with the same platform access and ranking as other members.

Administrators send invitations privately after documenting their decisions. Participants can accept, decline, withdraw, and control publicity from Settings. The public program page explains the criteria and lists only participants who consent and meet current identity and profile visibility requirements. Personal, public-figure and institutional verification retain their separate meanings.

Future identity verification will use time-bound proof of control through an approved channel. Proof supports a verification application. Badge approval requires a separate authorized review. Supabase sign-in MFA only protects account access.

Haitian and international organizations, NGOs, businesses, schools, media, and government institutions can create an AyiNou institutional profile. One person may represent multiple institutions through their own login. A profile can be published with an unverified label while its identity awaits review. A person claiming an institution must submit official references for independent ownership review. Institutions can invite members to defined roles and set a term where appropriate. Neither an invitation nor an accepted claim awards identity or institution verification.

Members can submit a manual application for personal identity, public-figure status, an organization, a government institution, or a representative position. AyiNou accepts links to official public sources. Do not submit government IDs or private evidence files. The workspaces and personal profile editor adapt to phones and use the available width above the mobile breakpoint.

People can manage one institution and belong to others as members, volunteers, staff, or supporters. An ordinary affiliation shows how the person joined, such as a direct join, manager approval, or invitation. It does not establish verified employment or authority to act for the institution. Institutions choose whether to list active members publicly. A member must separately consent to listing their display name and affiliation type.

## User safety

The department directory lists ten platform-operated Ayinou spaces. An official Ayinou community does not imply government endorsement. Eligible members in Haiti or elsewhere can choose several departments without disclosing residence, birthplace, or identity evidence. Joining enables access to that room’s discussions. Opting into its directory separately allows other room members to see an eligible public profile.

The signed-in feed lets members publish short updates, choose an audience, and keep private drafts. Members can report visible posts. Authorized moderators can hide, restore, remove, or close reports with a written reason. Members may appeal a current hide of their own post or comment within 14 days. An independent reviewer decides the appeal and shares a written explanation.

Blocking ends personal follows between the two members and stops their signed-in direct interactions. A signed-out viewer can still access eligible public content. Muting privately filters the member’s Latest, Following, and For You feeds while preserving their follow and interaction options.

Platform administrators can search a minimal account projection, investigate impersonation using public identifiers, and record account restrictions with an audit reason. Verification reviewers use a separate workspace for assigned work, public references, written decisions, and revocation. Both workspaces require recent authenticator verification. Members can manage their password and authenticator or sign out of all Supabase sessions from account settings.

- Enforce anti-harassment, anti-threat and anti-impersonation rules.
- Maintain accessible reporting, blocking, muting, and appeals.
- For fires, security incidents and vulnerable-person reports, avoid publishing actionable live location details by default.
- Do not imply Ayinou replaces emergency response or emergency services.
- Establish governance for verification disputes, misinformation appeals, and public corrections before the claim-verification module launches.

## Success metrics

Initial local testing covers the interface in four languages, access control, onboarding, and responsive layouts. After safe launch, measure retained members, diversity of department participation, verified projects completed, volunteer hours, and documented outcomes.

### Member-created groups

Members can organize around diaspora communities or interests. They choose open membership, approval, or private invitations. A public group can choose to open future discussions to visitors. Private groups are absent from discovery. Participation is voluntary and does not communicate anyone’s nationality, immigration status or location. Owners manage their groups. Platform administrators retain independent oversight of eligible content appeals.

### Community discovery

Members can explore recommended communities, official departments, diaspora groups and interest groups in the same directory. Visible reasons explain recommendations and feedback stays private. My Communities brings existing memberships, group roles, requests and invitations together. Opening the public directory or a public group URL still works without signing in.

### Reviewed identity and impersonation

A member can request review of a personal identity or a public-figure claim. Institutions and their representatives use separate categories. Claim labels communicate the result of a review. They do not guarantee any post, statement or project. An eligible applicant can contest a rejection or revocation within 14 days. Members can report suspected impersonation privately. Staff must review the evidence and document any action.

### Institutional trust profiles

Organizational badges describe the category of an independently reviewed claim. A representative badge applies to a particular institution and current role. Only a verified representative can opt in to appearing by public name and handle on an institution profile for signed-in viewers. Members can report suspected institutional impersonation, unauthorized representation or misleading affiliations. Applicants can appeal eligible written decisions through the existing Verification workspace.

### Operational organization roles

Institutions can define internal duties and assign existing eligible members or representatives one or more operational roles. Team lists, role changes and internal titles stay private. The Roles & Permissions workspace shows the current capabilities and reserved controls. Description, ordinary affiliation work, and project proposal operations have separate permissions. Future volunteer, recruitment, finance and announcement capabilities follow the release of those features.

### Community project proposals

Members can propose a project personally or on behalf of a community or institution when authorized. The proposal records the problem, solution, objectives, beneficiaries, expected outcomes, and broad region. A reviewer evaluates clarity, expected benefit, feasibility, privacy, and credible references. Only approved proposals that meet publication rules and opt in appear in discovery. Approval describes the review of a proposal. Delivery, fundraising, volunteer enrollment, and official authorization follow separate processes. Members can report unsafe or misleading listings privately.

Members can draft privately while applying for identity verification. A reviewed identity and current authority for the owner are required to submit. Public listing of an organization-owned project also requires verification of the organization itself. Review staffing is a launch dependency. The red role icon in signed-in account views denotes platform administration. The green badge describes a reviewed personal claim.

Approved projects can organize a private team and list volunteer opportunities once active. Individual project owners can run the same workflows as eligible institution and community owners. People choose whether to join, confirm a volunteer offer, or accept work. Task completion requires review and project completion requires an explicit owner transition. Volunteer roles describe participation and confer no employment relationship or professional credentials.

Project teams can document work through milestones, updates, supporting evidence, and reported measurements. Eligible public projects can show only reviewed public milestones, progress and final reports. Measurements remain labeled as team-reported. A final report distinguishes unfinished work and challenges from achievements, and a project archived without completion retains that distinction.


### Community voting and recommendations

Members can hold opinion polls, prioritize eligible projects, discuss a proposal or task through a scoped decision poll, and nominate eligible Ayinou members who consent to appear. Each eligible account gets one private ballot. The poll shows the audience, eligibility and result rules before members vote. Final results explain a tie, a missed requirement or a candidate withdrawal. The accountable organizer can record a recommendation, defer a decision, or decline the recommendation. Communities and institutions continue to use their existing appointments and approval processes. Ayinou polls are for internal participation and do not establish eligibility for public office or official election results.
