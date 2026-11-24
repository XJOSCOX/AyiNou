import { randomUUID } from "node:crypto";
import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, login, sql, test } from "./fixtures";
import { eventInstant } from "../src/lib/event-time";

test("F2.5 events keep private details scoped and enforce capacity under concurrent RSVP", async ({ makeMember, page }) => {
  test.setTimeout(90_000);
  const [organizer, first, second] = await Promise.all(Array.from({ length: 3 }, () => makeMember({ visible: true })));
  for (const person of [organizer, first, second]) finishPersonalOnboarding(person);
  const cover = null;
  const title = "F25 workshop " + randomUUID().slice(0,8);
  const request = randomUUID();
  const body = {
    version: null, request, organizationId: null, communityId: null, projectId: null, title,
    description: "Workshop for language learners", category: "education", format: "hybrid", visibility: "public",
    startsAt: new Date(Date.now()+86_400_000).toISOString(), endsAt: new Date(Date.now()+90_000_000).toISOString(),
    timeZone: "America/Port-au-Prince", country: "HT", department: "HT-OU", locality: "Port-au-Prince",
    venue: "Private venue", meetingUrl: "https://example.com/private-room", coverUrl: cover, capacity: 1, language: "ht",
  };
  const base = "/api/v1/events";
  const { event } = await apiCall(organizer,base,200,"POST",body);
  const path = base + "/" + event.id;
  expect((await apiCall(organizer,base,200,"POST",body)).event.id).toBe(event.id);
  expect((await fetch(api+path)).status).toBe(404);
  await apiCall(first,path + "/status",404,"POST",{ version: event.version, status: "published" });
  const published = (await apiCall(organizer,path + "/status",200,"POST",{ version: event.version, status: "published" })).event;
  const guest = await (await fetch(api+path)).json();
  expect(guest.event).toMatchObject({ venue: null, meetingUrl: null, counts: null });
  const results = await apiCall(first,base+"?q="+encodeURIComponent(title)+"&department=HT-OU&category=education",200);
  expect(results.page.map(({id}: {id:string}) => id)).toEqual([event.id]);
  const attempts = await Promise.all([first,second].map((member) => fetch(api + path + "/rsvp",{
    method:"PUT", headers:{Authorization:"Bearer " + member.token,"Content-Type":"application/json"},
    body:JSON.stringify({ response:"going",listMe:true }),
  })));
  expect(attempts.map(({status})=>status).sort()).toEqual([200,409]);
  const attendee = attempts[0].ok ? first : second;
  const observer = attempts[0].ok ? second : first;
  const details = await apiCall(attendee,path,200);
  expect(details.event).toMatchObject({ response:"going", venue:"Private venue", meetingUrl:body.meetingUrl });
  expect((await apiCall(observer,path,200)).event.meetingUrl).toBeNull();
  expect((await apiCall(observer,path + "/participants",200)).page).toEqual([]);
  expect((await apiCall(organizer,path + "/participants",200)).page).toMatchObject([{username:attendee.handle}]);
  await apiCall(organizer,path + "/updates",200,"POST",{submission:randomUUID(),body:"Bring your workbook"});
  const {postId} = await apiCall(organizer,path + "/share",200,"POST",{submission:randomUUID(),body:"Join the workshop",language:"ht"});
  const shared = (await apiCall(observer,"/api/v1/posts/" + postId,200)).post;
  expect(shared.social.event).toMatchObject({id:event.id,title});
  expect(JSON.stringify(shared)).not.toContain("private-room");
  const notices = await apiCall(attendee,"/api/v1/me/notifications",200);
  expect(notices.notifications.map((item: {communityEvent?: {action:string}}) => item.communityEvent?.action))
    .toEqual(expect.arrayContaining(["rsvp","announcement"]));
  await inEnglish(page.context()); await login(page,observer); await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/events/" + event.id);
  await expect(page.getByRole("heading",{name:title})).toBeVisible();
  await expect(page.getByRole("link",{name:"Meeting URL"})).toHaveCount(0);
  await apiCall(organizer,path + "/status",200,"POST",{ version: published.version,status:"canceled" });
  expect((await apiCall(attendee,path,200)).event.meetingUrl).toBeNull();
  await apiCall(attendee,path + "/rsvp",200,"PUT",{response:null,listMe:false});
  sql("update feed_data.events set creator_id=null where id=" + "'" + event.id + "'");
  await apiCall(observer,path + "/status",404,"POST",{ version: published.version+1,status:"canceled" });
  expect(sql("select has_table_privilege('authenticated','feed_data.event_rsvps','select');")).toBe("f");
});

test("F2.5 resolves local wall time at daylight-saving transitions", () => {
  expect(eventInstant("2027-03-14T02:30","America/New_York")).toBeNull();
  expect(eventInstant("2027-11-07T01:30","America/New_York")).toBe("2027-11-07T05:30:00.000Z");
  expect(eventInstant("2027-11-07T01:30","America/New_York","2027-11-07T06:30:00.000Z")).toBe("2027-11-07T06:30:00.000Z");
});


test("F2.5 organization events use live publishing authority and appear in announcements", async ({ makeMember }) => {
  const [owner,viewer] = await Promise.all([makeMember({ visible:true }),makeMember({ visible:true })]);
  finishPersonalOnboarding(owner); finishPersonalOnboarding(viewer);
  const handle = "event-" + randomUUID().slice(0,8);
  const organizationId = sql(`with created as (insert into private.organizations(handle,name,kind,country_code,created_by)
    values('${handle}','Event fixture organization','nonprofit','HT','${owner.id}') returning id) select id from created;`);
  sql(`insert into private.organization_memberships(organization_id,user_id,role)
    values('${organizationId}','${owner.id}','owner'),('${organizationId}','${viewer.id}','viewer');`);
  const eventInput = {
    version:null, request:randomUUID(), organizationId, communityId:null, projectId:null, title:"Organization training",
    description:"Learn about community projects", category:"education", format:"online", visibility:"public",
    startsAt:new Date(Date.now()+86_400_000).toISOString(), endsAt:new Date(Date.now()+90_000_000).toISOString(),
    timeZone:"America/Port-au-Prince", country:null, department:null, locality:null, venue:null,
    meetingUrl:null, coverUrl:null, capacity:null, language:"fr",
  };
  const base = "/api/v1/events";
  expect((await apiCall(owner,base + "/capabilities",200)).organizations).toContainEqual(expect.objectContaining({id:organizationId}));
  expect((await apiCall(viewer,base + "/capabilities",200)).organizations).toEqual([]);
  await apiCall(viewer,base,404,"POST",eventInput);
  const {event} = await apiCall(owner,base,200,"POST",eventInput);
  const path = base + "/" + event.id;
  expect(event.organizer).toMatchObject({kind:"organization",handle});
  const published = (await apiCall(owner,path + "/status",200,"POST",{version:event.version,status:"published"})).event;
  const updated = (await apiCall(owner,path,200,"PUT",{...eventInput,version:published.version,title:"Training for volunteers"})).event;
  expect(updated.version).toBe(published.version+1);
  const share = {submission:randomUUID(),body:"Join our organization training",language:"fr"};
  await apiCall(viewer,path + "/share",404,"POST",share);
  const {postId} = await apiCall(owner,path + "/share",200,"POST",share);
  const announcements = await (await fetch(api + "/api/v1/institutions/by-handle/" + handle + "/posts?filter=announcements")).json();
  expect(announcements.posts).toContainEqual(expect.objectContaining({id:postId,social:expect.objectContaining({
    announcement:true,event:expect.objectContaining({id:event.id,title:"Training for volunteers"}),
  })}));
  await apiCall(viewer,path + "/report",200,"POST",{category:"other",note:"Test report"});
  await apiCall(viewer,base + "/moderation/reports",403);
  expect((await fetch(api + "/api/v1/admin/feature-policy/events.enabled")).status).toBe(401);
  sql(`delete from private.organization_memberships where organization_id='${organizationId}' and user_id='${owner.id}';`);
  await apiCall(owner,path,404,"PUT",{...eventInput,version:updated.version});
});
