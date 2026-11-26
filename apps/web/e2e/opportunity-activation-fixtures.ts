import { randomUUID } from "node:crypto";
import type { OpportunityActivationCommand, OpportunityActivationRead, OpportunityActivationStage, OpportunityPauseScope } from "@ayinou/shared";
import { api, expect, sql, type Member } from "./fixtures";

export const opportunityControlPath = "/api/v1/admin/opportunity-settings/activation";
export const activationReason = "Disposable C4 activation and safety rehearsal.";

export async function callActivation(member: Member | undefined, workspace?: string, input?: object, origin = api) {
  const response = await fetch(origin + opportunityControlPath, {
    method: input ? "PATCH" : "GET",
    headers: { ...(member && { Authorization: "Bearer " + member.token }),
      ...(workspace && { "X-Ayinou-Workspace": workspace }), ...(input && { "Content-Type": "application/json" }) },
    body: input ? JSON.stringify(input) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-robots-tag")).toContain("noindex");
  const data = await response.json();
  return { status: response.status, data };
}

export async function stageControls(member: Member, workspace: string) {
  async function read(): Promise<OpportunityActivationRead> {
    const result = await callActivation(member, workspace);
    expect(result.status, JSON.stringify(result.data)).toBe(200);
    return result.data;
  }
  let panel = await read();
  async function command(capability: OpportunityActivationStage | OpportunityPauseScope, action: OpportunityActivationCommand,
    result = 200, changes: object = {}) {
    const configuration = panel.stages.find(stage => stage.capability === capability)?.digest ?? panel.emergency[capability as OpportunityPauseScope];
    const response = await callActivation(member, workspace, {
      capability, action, expectedVersion: panel.version, configuration, requestId: randomUUID(),
      reason: activationReason, confirmed: true, ...changes,
    });
    expect(response.status, JSON.stringify(response.data)).toBe(result);
    if (result === 200) panel = { ...panel, version: response.data.version };
    return response.data;
  }
  return { command, refresh: async () => { panel = await read(); return panel; } };
}

export function prepareOpportunityActivation(member: Member, workspace: string) {
  sql(`insert into private.c41_settings(version,settings,actor,workspace,request_id,fingerprint,reason)
    values(1,private.c41_defaults(),'${member.id}','${workspace}',gen_random_uuid(),'c46 fixture','Disposable activation rehearsal');
    insert into private.c45_settings(version,actor,workspace,request,fingerprint,reason,configuration)
    values(1,'${member.id}','${workspace}',gen_random_uuid(),decode('c4','hex'),'Disposable activation rehearsal',private.c45_defaults());
    insert into private.c45_fixture default values;
    insert into private.c46_fixture(release_authorized,opportunity_operations,opportunity_privacy,opportunity_safeguarding)
    values(true,true,true,true);`);
}

export function prepareMentorshipActivation(member: Member, workspace: string) {
  sql(`insert into private.c43_settings values(true,1,private.c43_defaults(),'Disposable adult safeguarding plan','Rehearsal only');
    insert into private.c44_preparation(version,actor,workspace,reason,settings)
    values(1,'${member.id}','${workspace}','Disposable activation rehearsal',private.c44_settings());
    insert into private.c46_fixture(release_authorized,mentorship_operations,mentorship_privacy,mentorship_safeguarding)
    values(true,true,true,true);`);
}

export function clearActivation() {
  sql("delete from private.c46_fixture; delete from private.c46_stage; delete from private.c46_history;");
}
