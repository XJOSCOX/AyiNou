# D2 backup configuration assessment

D2 inspected the exact Ayinou project `hcbxulyfmdmuyccgrujs`, active and healthy in `us-east-2`. Its organization matched the project metadata. The supported CLI inventory exposed no billing plan. The desktop browser check ended because the Windows computer-use runtime could not confidently identify the active URL. Billing tier, project-specific retention and isolated clone eligibility therefore remain unverified.

| Capability | Evidence and decision |
| --- | --- |
| Effective plan | Unknown. Have the billing owner verify the exact project's organization plan, add-ons, current compute and entitlements in the Dashboard. Do not infer a Free plan from an empty inventory. |
| Usable database recovery point | Zero available backups listed. The physical-backup data object had no earliest or latest recovery point. WAL-G reported enabled. There is no verified provider recovery point or independent hosted artifact. |
| PITR | Disabled for this project. Eligibility unverified. Review paid plan, supported compute and physical backup status with the billing owner before changing anything. |
| Daily retention and isolated restore | Supabase documents 7 days for Pro, 14 for Team and up to 30 for Enterprise. Restore to a new project requires paid eligibility and physical backups. Confirm source region, destination capacity, access, accepted downtime and Storage requirements. The provider clones in the same region and charges separately for the new project resources. A clone cannot become a source for another clone under the documented rules. An empty project-specific inventory proves no retention window. |
| Independent recovery copies | Supabase supports logical backup procedures. A tested production export would still need owner authorization, a restricted destination, approved exclusions and retention, protected credentials and proof of restoration. D2 has synthetic evidence only. |
| Upgrade decision | A Free plan would need a paid tier for dashboard daily backups and provider clone eligibility. PITR requires a distinct add-on and supported compute. The current project tier is unresolved, so no upgrade or charge is assumed. |

Public pricing checked November 21, 2026, lists Pro starting at **US$25/month** and 7-day PITR at about **US$100/month**, before any additional compute, transfer, destination or external backup costs. This is public list pricing. The current invoice and a project-specific quote are unverified. No purchase or configuration change was made. [Supabase pricing](https://supabase.com/pricing) · [Backup eligibility and PITR pricing](https://supabase.com/docs/guides/platform/backups) · [Isolated restore requirements](https://supabase.com/docs/guides/platform/clone-project)
