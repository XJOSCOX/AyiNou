# Ayinou policy decision register

**DRAFT — NOT APPROVED FOR PUBLICATION**

English working register, updated in Legal Phase L2 from baseline `5cf9df620ee3dbb3e4b2456379dbdf0f6262dc63`. The original L1 questions below remain open. The owner has supplied planning facts, and those facts do not approve recommendations, appointments, markets or technical changes. Record the decision, evidence, approver, date and policy version for each item. See the [owner brief](OWNER_DECISION_BRIEF.md) for staged approval.

## Operator, eligibility and legal scope

| ID | Decision and proposed direction | Approval or evidence required |
| --- | --- | --- |
| L1-01 | **Operator.** Confirm [full legal name and form], [registration jurisdiction and number, if applicable], [registered or service address], and [business contact]. Confirm ownership of the brand, domain and application assets. | Owner supplies registration and ownership records. Counsel confirms the entity responsible for the service and the privacy notice. |
| L1-02 | **Contacts.** Confirm [support], [privacy], [safety], [intellectual-property], and [legal notices] contacts. Decide which may share a mailbox, which require separate access, how to handle sensitive evidence, and who covers absences. | Owner and operations verify intake, escalation, ownership, supported languages and handling of formal or urgent requests. |
| L1-03 | **Launch markets.** Approve [countries and regions served], whether launch is invitation-only or open, and whether any offered service is country-specific. | Owner specifies actual targeting, eligibility and access. Counsel assesses the operator's location and the places where Ayinou offers services or monitors behavior. |
| L1-04 | **Age and minors.** Approve [minimum account age by market], treatment of existing or suspected underage accounts, any guardian process, and whether a stricter launch limit is appropriate. | Counsel reviews child privacy, capacity to agree, consent and safety duties. Product verifies the least intrusive way to enforce the decision. Current registration does not implement an approved age policy or guardian workflow. |
| L1-05 | **Governing law and disputes.** Decide [governing law], [forum], [informal resolution procedure and contact], any mediation or other process, and treatment of mandatory local rights. | Counsel reviews consumer and contract rules and the ability to operate each route. No compulsory arbitration, class waiver or exclusive venue is proposed as an approved term. |
| L1-06 | **Effective date and changes.** Approve [effective date], [notice channel and timing], when terms require fresh acceptance, and how material changes are handled across languages. | Owner, counsel and operations approve release procedure and identify a usable notice channel. No versioned acceptance flow is part of this phase. |

## Product policy and operations

| ID | Decision and proposed direction | Approval or evidence required |
| --- | --- | --- |
| L1-07 | **Content licence and ownership.** Start with a narrow non-exclusive permission for service operation, displaying content to its selected audience and applying safety controls. Resolve processor delegation, scope and duration, sharing, backups, previously downloaded copies, and whether any wider use needs separate permission. | Counsel approves scope and duration. Owner confirms branding and asset rights. |
| L1-08 | **Intellectual property.** Approve complaint, response and counter-notice workflows where relevant, confidentiality, repeat infringement and reinstatement rules. | Counsel assesses applicable regimes and any designated-agent or contact requirement. Staff and test a channel before promising response times. |
| L1-09 | **Enforcement and appeals.** Approve standards, severity and proportionality, urgent handling, notice exceptions, roles, evidence access, turnaround targets and language coverage. Resolve account restrictions, group-removal challenges, and other decisions outside the two existing in-app appeal flows. | Operations staffs independent review and moderation. Counsel reviews procedural obligations, reporting duties and handling of high-risk material. |
| L1-10 | **Trust, projects and polls.** Confirm reviewer independence, representative verification, project publication governance, safety practices for volunteers and poll dispute handling. Decide how recommendations may inform later decisions. | Zero eligible verification reviewers and one active administrator were observed in the final engineering review. Staff independent reviews, appeal coverage and administrator continuity before relying on them. |
| L1-11 | **Availability and liability.** Approve the consumer-facing limitations, remedies, suspension and discontinuation process, termination notice, and terms that survive closure. | Counsel reviews mandatory remedies, limitations and unfair terms in launch markets. Operations confirms continuity, contact and recovery procedures. |
| L1-12 | **Media safety and emergency response.** Decide response ownership and escalation for threats, exploitation, abuse, doxxing, and requests from authorities. | Staff human review, restricted evidence handling and incident response. Check what legal reporting applies and who is authorized to act. |

## Privacy and records

| ID | Decision and proposed direction | Approval or evidence required |
| --- | --- | --- |
| L1-13 | **Processing and rights.** Approve purposes, applicable legal bases or other authority by purpose, required notices, request rights and limits, identity verification, acknowledgement and response times, appeal channels, regulator contacts and representatives where required. | Counsel maps obligations to region and category. Owner assigns trained staff and an intake channel that can handle access, correction, export, deletion, restrictions and complaints securely. |
| L1-14 | **Provider and international records.** Confirm operator/provider roles, production hosting, database and backup locations, support access locations, SMTP, subprocessors, agreements and any required transfer mechanism. | Review the actual project configuration and contracts. Public supplier terms alone do not establish Ayinou's contractual arrangements or enabled safeguards. |
| L1-15 | **Retention, holds and restoration.** Approve category-specific triggers and schedules, backup rotation, access restrictions, hold authority, independent authorization to lift a hold, and evidence minimization. Define closure treatment of contributions and de-identified ballot records. | Use the [retention matrix](RETENTION_AND_DELETION_MATRIX.md). Confirm expiry versus deletion, test restore without re-exposing erased data, and agree how exceptions are explained. |
| L1-16 | **Cookies and telemetry.** Confirm actual cookies and browser storage, production monitoring, provider logs and any optional analytics. Decide notice and controls before enabling optional collection. | Browser/network inventory in the production configuration and regional review of storage/access rules. Clarify routine security logging and retention. |
| L1-17 | **Language authority.** Approve [authoritative version and rule for discrepancies], [languages published per market], and the route for reporting a translation problem. | English is the working source only. Qualified human language and legal reviewers approve Haitian Creole, French and Spanish. Preserve each reviewed version and approval together. |

## Questions for qualified legal review

- What Haitian privacy, consumer, contract, child-safety and platform rules apply to the actual entity and activities? Verify the authoritative text, scope, in-force status, regulators and remedies for private services. The government-hosted 2016 decree concerns dealings with public administration and is a research starting point. [Le Moniteur decree hosted by Haiti's OMRH](https://www.omrh.gouv.ht/Media/Publications/3-Decrets/Decret%20portant%20sur%20le%20droit%20de%20tout%20administr%C3%A9.pdf)
- If Ayinou reaches EU or EEA residents, is it within the territorial scope of the GDPR or the Digital Services Act? Determine notice and legal-basis requirements, rights and exceptions, child rules, profiling disclosures, international transfer conditions, content reports, reasons for decisions, appeals, and any applicable size-based exceptions. [GDPR text](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng) · [Digital Services Act text](https://eur-lex.europa.eu/eli/reg/2022/2065/oj/eng)
- For U.S. or Canadian launch markets, which federal, state or provincial rules apply to consumer privacy, children, removal and data rights? Assess whether COPPA is triggered by how the service is directed or what the operator knows, whether and how Section 512 is relevant, and how Canadian federal and provincial rules interact with actual activities and cross-border processing. Extend the review to each approved launch market. [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) · [U.S. Copyright Office Section 512 resources](https://www.copyright.gov/512/) · [Canadian privacy regulator overview](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/02_05_d_15/)
- Which obligations apply to verification references, user-supplied location, protected characteristics shared in content, private reports, voting data, legal holds and evidence requests? Confirm appropriate minimization and identity checks for the rights channel. Review the supplier terms against the operator's own account, purchased services and configured regions. [Supabase customer data processing addendum](https://supabase.com/legal/customer-resources/data-processing-addendum)

## Evidence and related drafts

The engineering baseline records actual feature and access behavior. The documents below are separate working drafts. A registry entry marked approved would still require evidence that operational and technical provisions can be fulfilled. [Final engineering review](../audits/PHASE_6F_FINAL_REVIEW.md) · [Data inventory](../audits/PRIVACY_DATA_INVENTORY.md) · [Existing project decisions](../DECISIONS.md) · [Implementation plan](LEGAL_IMPLEMENTATION_PLAN.md)

## L2 review of all seventeen decisions

Use **Confirmed factual direction** for facts supplied by the owner, **Recommended, awaiting owner approval** for proposed defaults, **Requires legal review** and **Requires technical implementation** for separate dependencies, **Deferred** for decisions deliberately postponed, and **Approved only when explicitly authorized** as the approval rule. The statuses can coexist. No policy recommendation has received approval. Wider markets, minors, fundraising and optional vendors are recommended for deferral until separately scoped. [Formation evidence and facts](NONPROFIT_STRUCTURE_RESEARCH.md) · [International review](INTERNATIONAL_LEGAL_REVIEW.md)

### L1-01 Legal operator

- **Confirmed facts** Independent Texas nonprofit intended; unincorporated with no IRS recognition or confirmed operator.
- **Recommendation, alternatives and trade-offs** Evaluate a board-managed Texas nonprofit corporation with no statutory members. LLC or statutory membership are alternatives; both add complexity for this plan.
- **Operations and technical needs** Separate assets and accounts, establish authorized signatories, verify domain and code title before moving any assets; add verified operator details later.
- **Owner, counsel and verification** Owner approves structural direction and proposed name; counsel reviews certificate, exempt purpose, related-party transfers and operator roles. Evidence is formation and board records, title/licences and signed provider records.
- **Status** Confirmed factual direction · Recommended, awaiting owner approval · Requires legal review

### L1-02 Operator contacts

- **Confirmed facts** Support, privacy, safety, IP and legal addresses and staffing are pending.
- **Recommendation, alternatives and trade-offs** Use role-owned channels with separate restricted queues for sensitive cases. Shared inboxes cost less but make access and conflict controls harder.
- **Operations and technical needs** Set verified delivery, backups, response coverage, accessible intake and language support. Do not accept credentials or sensitive evidence in ordinary mail.
- **Owner, counsel and verification** Owner designates channels and responsible people; counsel reviews formal service and rights intake. Evidence is channel ownership and tested routing/escalations.
- **Status** Recommended, awaiting owner approval · Requires legal review · Requires technical implementation

### L1-03 Operating regions

- **Confirmed facts** Haitian-centered audience, with no approved launch geography or production host.
- **Recommendation, alternatives and trade-offs** Use a limited, invite-based pilot in specifically reviewed markets. Broad access widens participation and increases legal, operational and localization requirements.
- **Operations and technical needs** Document targeting and eligibility, review public page access separately, design an accessible market gate and a correction path where warranted.
- **Owner, counsel and verification** Owner selects first markets and audience; local counsel confirms legal triggers. Evidence is dated scope decisions, market map and rollout tests.
- **Status** Recommended, awaiting owner approval · Requires legal review · Requires technical implementation

### L1-04 Age and minors

- **Confirmed facts** Signup lacks an approved age or guardian workflow. Authenticator and identity checks serve separate purposes.
- **Recommendation, alternatives and trade-offs** Consider an adults-only pilot with market-specific definition. Age 16, 13 with protective limits, or varying floors improve access while substantially increasing safety, consent and compliance work.
- **Operations and technical needs** Use proportionate age assurance, minimize data, separate volunteer/poll restrictions and handle mistaken results and credible underage reports.
- **Owner, counsel and verification** Owner approves floor and youth policy; counsel covers COPPA, GDPR Art. 8 and local capacity/consent. Evidence is age design, risk assessment and correction/enforcement tests.
- **Status** Recommended, awaiting owner approval · Requires legal review · Requires technical implementation

### L1-05 Governing law and disputes

- **Confirmed facts** Texas formation is intended. Governing law, court venue and disputes procedure are pending.
- **Recommendation, alternatives and trade-offs** Evaluate Texas law subject to mandatory local rights. Offer staffed informal resolution first. Local forums or voluntary mediation may improve access; exclusive forum or arbitration would add friction and enforceability risk.
- **Operations and technical needs** Set dispute contact, case records, accessibility, time limits and a path for unresolved concerns. Keep in-app appeals separate.
- **Owner, counsel and verification** Owner chooses approach; counsel validates consumer protections and enforceability in approved markets. Evidence is reviewed clause and support procedure.
- **Status** Recommended, awaiting owner approval · Requires legal review

### L1-06 Effective date and updates

- **Confirmed facts** No approved date, public policy release or versioned acceptance flow.
- **Recommendation, alternatives and trade-offs** Set dates after approval, preserve versions and notify proportionately. Maintaining a simple change log costs less but may miss required notice or acceptance for material changes.
- **Operations and technical needs** Classify changes, record communications and locale versions, and design acceptance later only where approved. Consent, terms agreement and receipt of a notice are distinct.
- **Owner, counsel and verification** Owner approves release authority and notice channels; counsel approves rules for material changes and fresh agreement. Evidence is approval log and delivery/accessibility rehearsal.
- **Status** Recommended, awaiting owner approval · Requires legal review · Requires technical implementation

### L1-07 Content licence and ownership

- **Confirmed facts** Current service stores images/text and applies audience settings. Project asset and trademark title remains to be verified.
- **Recommendation, alternatives and trade-offs** Use a narrow nonexclusive service licence. Broader reuse could support outreach but needs a separate basis and can exceed member expectations.
- **Operations and technical needs** Honor audiences and held evidence, map vendors, obtain separate permission for wider reuse and record founder asset assignments/licences.
- **Owner, counsel and verification** Owner approves scope and asset treatment; counsel reviews duration, revocation, sublicensing, warranty and third-party rights. Evidence is rights register, reviewed terms and permission checks.
- **Status** Recommended, awaiting owner approval · Requires legal review

### L1-08 Intellectual-property complaints

- **Confirmed facts** General reporting exists. A specialized notice, counter-notice and agent workflow is unconfirmed.
- **Recommendation, alternatives and trade-offs** Design a rights inbox with confidential triage; evaluate a formal § 512 path only if appropriate. Ordinary reports alone are simpler and may not meet applicable requirements.
- **Operations and technical needs** Staff review, record receipt and disposition, limit disclosures and design reinstatement, repeat infringement and appeal handling.
- **Owner, counsel and verification** Owner approves staffing; counsel decides eligibility, applicable laws, agent requirements and notices. Evidence is reviewed runbook, contact and case drills.
- **Status** Recommended, awaiting owner approval · Requires legal review · Requires technical implementation

### L1-09 Enforcement and appeals

- **Confirmed facts** Eligible current content hides and eligible verification rejects/revocations have separate in-app 14-day appeal flows. Other restrictions do not all share these routes.
- **Recommendation, alternatives and trade-offs** Use graduated enforcement and independent review with documented emergency exceptions. A wider in-app appeal channel can improve consistency but needs staffing and implementation.
- **Operations and technical needs** Design notices, language cover, conflicts, record access and incident escalation. Avoid promising uniform response times until proved.
- **Owner, counsel and verification** Owner approves severity and coverage; counsel reviews procedural duties and preservation. Evidence is a decision matrix and end-to-end case tests.
- **Status** Recommended, awaiting owner approval · Requires legal review · Requires technical implementation

### L1-10 Trust, projects and polls

- **Confirmed facts** Reviewed identity is required for proposal submission; higher-trust ballots have stronger eligibility. Final review observed zero eligible verification reviewers and one active administrator.
- **Recommendation, alternatives and trade-offs** Keep scopes separate, staff independent reviewers and train volunteer leads. Delay critical workflows where staff cannot fulfill gates. Making review automatic would undermine independence and public trust.
- **Operations and technical needs** Record provenance, especially the separate bootstrap exception, role reviews, volunteer safeguards, consent, scope privacy and poll dispute handling.
- **Owner, counsel and verification** Owner approves staffing and governance; counsel reviews claims, volunteer risks and election confusion. Evidence includes role roster, recusal and emergency drills, and authorization tests.
- **Status** Recommended, awaiting owner approval · Requires legal review

### L1-11 Availability and liability

- **Confirmed facts** Engineering review passed for the tested scope; uptime, disaster recovery and public support commitments are unapproved.
- **Recommendation, alternatives and trade-offs** Use factual service limitations and preserve mandatory remedies. Fixed service targets provide predictability but require verified capability.
- **Operations and technical needs** Specify outage and closure communication, recovery coverage and realistic service targets. Contract provisions and closure behavior should align.
- **Owner, counsel and verification** Owner approves actual support commitments; counsel reviews restrictions, remedies and mandatory rights. Evidence is approved text and a restoration/closure drill.
- **Status** Recommended, awaiting owner approval · Requires legal review

### L1-12 Media safety and emergency response

- **Confirmed facts** Image decoding and scoped media/reporting exist. Human media staffing and continuous monitoring are unverified.
- **Recommendation, alternatives and trade-offs** Write a human escalation runbook for imminent danger, exploitation, private imagery, doxxing, threats and suspected fraud. A scanning vendor could reduce triage load but adds privacy and oversight duties.
- **Operations and technical needs** Restrict incident evidence, train covered responders, avoid duplicating harmful material, validate reporting and urgent triage by market.
- **Owner, counsel and verification** Owner assigns coverage; counsel evaluates duties under relevant laws and disclosure limits. Evidence is a tested incident drill, documented visibility controls and monitored channels.
- **Status** Recommended, awaiting owner approval · Requires legal review

### L1-13 Processing and member rights

- **Confirmed facts** Inventory identifies purposes, data and controls. End-to-end request tracking, export and deletion are absent.
- **Recommendation, alternatives and trade-offs** Map legal authority per purpose and jurisdiction. Build scoped access, correction, export and closure intake. Manual pilot support is possible only after an approved, tested runbook; automation improves repeatability after patterns are understood.
- **Operations and technical needs** Use proportionate authentication, redaction, deadlines, accessible escalation, restricted roles and quality tests for partial completion.
- **Owner, counsel and verification** Owner approves channels and support model; counsel signs the legal basis/rights matrix and exceptions. Evidence is approved inventory and end-to-end request fixtures.
- **Status** Recommended, awaiting owner approval · Requires legal review · Requires technical implementation

### L1-14 Providers and international handling

- **Confirmed facts** Cloudflare manages ayinou.com DNS. Development uses Supabase for Auth, database and private Storage. Production host, SMTP, locations and contracts are pending.
- **Recommendation, alternatives and trade-offs** Prefer a small documented provider set with support and restore evidence. Single-region design can simplify oversight; multi-region may improve latency with greater transfer complexity.
- **Operations and technical needs** Map traffic, direct links and DNS/proxy settings, backup and support access, agreements, deletion methods and transfer controls before committing.
- **Owner, counsel and verification** Owner approves vendors/regions; counsel confirms roles, agreements and safeguards. Evidence is actual settings, signed terms, subprocessor records and restore/deletion drills.
- **Status** Confirmed factual direction · Recommended, awaiting owner approval · Requires legal review

### L1-15 Retention, holds and restoration

- **Confirmed facts** Some visibility timers and bounded cleanup exist. No category-wide schedule, deletion workflow or verified production restore process.
- **Recommendation, alternatives and trade-offs** Use event-based retention and minimum evidence. Blanket schedules simplify description but can either lose needed evidence or keep everything too long.
- **Operations and technical needs** Approve separate triggers and exceptions. Implement scoped holds, deletion verification, de-identification assurance and replay of verified erasures during restoration.
- **Owner, counsel and verification** Owner approves principles and eventual schedules; counsel confirms any required periods and exceptions. Evidence is a category schedule, owner assignments and isolated purge/restore results.
- **Status** Recommended, awaiting owner approval · Requires legal review · Requires technical implementation

### L1-16 Cookies and telemetry

- **Confirmed facts** Current uses include Auth and locale cookies and local theme/language/Feed preferences. Production tracking decisions are open.
- **Recommendation, alternatives and trade-offs** Start without optional marketing or analytics. Consider minimal reliability telemetry with retention limits. Optional analytics may support planning but brings disclosures, choice and provider obligations.
- **Operations and technical needs** Inventory exact production browser/network behavior and cookie expiries. Classify purposes, user controls, vendors and deletion before activating optional collection.
- **Owner, counsel and verification** Owner approves telemetry; counsel screens ePrivacy and other regional rules. Evidence is a device-state/network audit and reviewed notice.
- **Status** Recommended, awaiting owner approval · Requires legal review · Requires technical implementation

### L1-17 Language authority

- **Confirmed facts** Interface supports Haitian Creole, French, English and Spanish. L1 drafts are English only.
- **Recommendation, alternatives and trade-offs** Use English as an internal source with qualified human review in every release language. A market-specific authoritative version may be needed; silent fallback risks inconsistent terms.
- **Operations and technical needs** Keep source/translation release pairing, approvals, accessibility checks, discrepancy triage and historical snapshots.
- **Owner, counsel and verification** Owner approves source/authoritative rules and language coverage; counsel confirms mandatory local precedence. Evidence is reviewed locale package and version/update rehearsal.
- **Status** Recommended, awaiting owner approval · Requires legal review · Requires technical implementation
