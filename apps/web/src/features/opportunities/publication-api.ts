import { publicRequest } from "@/lib/api";
import { authorizedSocialRequest } from "@/lib/feed-api";

const workspacePath="/api/v1/opportunity-publication/workspace";
export type PublishedOpportunity={
  id:string;version:number;organization:string;verified:boolean;
  snapshot:{title:string;description:string;type:import("@ayinou/shared").OpportunityInput["type"];country:string;department?:string;mode:import("@ayinou/shared").OpportunityInput["mode"];
    opensOn?:string;closesOn?:string;details?:Record<string,unknown>};
  methods:{external?:boolean;interest?:boolean;event?:string};
};
export type PublicationCase={
  enabled:boolean;version:number;status:import("@ayinou/shared").OpportunityStatus;canSubmit:boolean;canPublish:boolean;canReadInterest:boolean;
  review?:{state:string;explanation?:string;decidedAt?:string;challenged:boolean};
};
export type Interest={id:string;revision:number;version:number;state:string;title?:string;
  shared_identity?:{username:string;displayName:string};statement?:string};
export type ReviewCase={opportunity:string;revision:number;state:string;authority?:string;title:string;country:string;department?:string;
  assigned_until?:string;assignment_accepted?:boolean;snapshot?:PublishedOpportunity["snapshot"]&{references?:string[]};ownership?:string;challenge_reason?:string};
export type ReviewerGrant={id:string;reviewer?:string;username?:string;country:string;department?:string;expires_at:string};
export type PublicationSettings={types:string[];methods:string[];submissionsPerDay:number;interestPerDay:number;reportsPerDay:number;staffingPlan?:string;readinessNotes?:string};
export type PublicationSettingsView={version:number;live:false;fixture:boolean;settings:PublicationSettings;
  history:{id:number;explanation:string;recorded_at:string;result:{version:number}}[]};
export type Queue<T>={enabled:boolean;items:T[];next?:string;grants?:ReviewerGrant[]};
export type InterestPreview={revision:number;identity:{username:string;displayName:string}};
export function listedOpportunities(organization:string, after:string|null, signal:AbortSignal, signedIn=false, opportunity?:string):Promise<Queue<PublishedOpportunity>> {
  const query = new URLSearchParams();
  if (after) query.set("after", after);
  if (opportunity) query.set("opportunity", opportunity);
  return (signedIn?authorizedSocialRequest:publicRequest)("/api/v1/opportunity-publication/public/"+organization+(query.size?"?"+query:""),{ signal,cache:"no-store" });
}
export function workspaceRead<T>(action:string, parameters:Record<string,string>,signal:AbortSignal,workspace?:string):Promise<T> {
  return authorizedSocialRequest(workspacePath+"?"+new URLSearchParams({action,...parameters}),{
    signal,cache:"no-store",headers:workspace?{"X-Ayinou-Workspace":workspace}:undefined,
  });
}
export function workspaceCommand<T>(body:object,workspace?:string):Promise<T> {
  return authorizedSocialRequest(workspacePath,{method:"POST",body:JSON.stringify(body),
    headers:workspace?{"X-Ayinou-Workspace":workspace}:undefined});
}
