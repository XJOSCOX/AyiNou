import { randomUUID } from "node:crypto";
import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, login, sql, test } from "./fixtures";
import { eventInstant } from "../src/lib/event-time";

test("F2.5 events keep private details scoped and enforce capacity under concurrent RSVP", async ({ makeMember, page }) => {
  test.setTimeout(90_000);
  const [organizer, first, second] = await Promise.all(Array.from({ length: 3 }, () => makeMember({ visible: true })));
  for (const person of [organizer, first, second]) finishPersonalOnboarding(person);
  sql(`insert into public.verification_records(user_id,verification_type,status,source,reviewed_by,verified_at)
    values ('${organizer.id}','identity','verified','review','${first.id}',now());`);
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
  expect(guest.event).toMatchObject({ venue: null, meetingUrl: null, counts: null, organizer: { personalClaims: ["identity"] } });
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
  expect(shared.social.event).toMatchObject({id:event.id,title,organizer:{personalClaims:["identity"]}});
  expect(JSON.stringify(shared)).not.toContain("private-room");
  const notices = await apiCall(attendee,"/api/v1/me/notifications",200);
  expect(notices.notifications.map((item: {communityEvent?: {action:string}}) => item.communityEvent?.action))
    .toEqual(expect.arrayContaining(["rsvp","announcement"]));
  await inEnglish(page.context()); await login(page,observer); await expect(page).toHaveURL(/\/dashboard/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/events?scope=invalid");
  const navigation = page.getByRole("navigation", { name: "Events", exact: true });
  const tab = (name: string) => navigation.getByRole("link", { name, exact: true });
  await expect(tab("Upcoming")).toHaveAttribute("aria-current", "page");
  for (const [label, scope] of [
    ["Following", "following"], ["My communities", "communities"], ["Past", "past"],
    ["My RSVPs", "mine"], ["Organizing", "organizing"],
  ]) {
    await tab(label).click();
    await expect(page).toHaveURL("/events?scope=" + scope);
    await expect(tab(label)).toHaveAttribute("aria-current", "page");
  }
  await page.goBack();
  await expect(tab("My RSVPs")).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(tab("Organizing")).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(tab("Organizing")).toHaveAttribute("aria-current", "page");
  await page.goto("/events?scope=past");
  await expect(tab("Past")).toHaveAttribute("aria-current", "page");
  await tab("Upcoming").click();
  await expect(page).toHaveURL("/events");
  const eventRow = page.getByRole("link", { name: title, exact: true });
  await expect(eventRow.getByText(body.description, { exact: true })).toBeVisible();
  await expect(eventRow.getByText("Port-au-Prince · Hybrid", { exact: true })).toBeVisible();
  await expect(eventRow.locator("time")).toBeVisible();
  await expect(eventRow.getByRole("img", { name: "Identity verified", exact: true })).toBeVisible();
  await expect(eventRow.getByText(body.venue, { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const filters = page.getByRole("button", { name: "Filters", exact: true });
  await expect(filters).toHaveAttribute("aria-expanded", "false");
  await filters.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Category", exact: true })).toBeVisible();
  await filters.click();
  await page.getByRole("searchbox", { name: "Search by title" }).fill(title);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await eventRow.click();
  await expect(page).toHaveURL("/events/" + event.id);
  await expect(page.getByRole("heading",{name:title})).toBeVisible();
  await expect(page.getByRole("link", { name: "Back", exact: true })).toHaveAttribute("href", "/events");
  await expect(page.getByRole("navigation", { name: "Events", exact: true }).getByRole("link", { name: "My communities" }))
    .toHaveAttribute("href", "/events?scope=communities");
  await expect(page.locator("article header").getByRole("img", { name: "Identity verified", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole("link",{name:"Meeting URL"})).toHaveCount(0);
  await apiCall(organizer,path + "/status",200,"POST",{ version: published.version,status:"canceled" });
  expect((await apiCall(attendee,path,200)).event.meetingUrl).toBeNull();
  await apiCall(attendee,path + "/rsvp",200,"PUT",{response:null,listMe:false});
  sql("update feed_data.events set creator_id=null where id=" + "'" + event.id + "'");
  await apiCall(observer,path + "/status",404,"POST",{ version: published.version+1,status:"canceled" });
  expect(sql("select has_table_privilege('authenticated','feed_data.event_rsvps','select');")).toBe("f");
});

test("Events tabs show the right events for membership, following, RSVP, and ownership", async ({ makeMember, page }) => {
  test.setTimeout(90_000);
  const [host, viewer, outsider] = await Promise.all(Array.from({ length: 3 }, () => makeMember({ visible: true })));
  for (const person of [host, viewer, outsider]) finishPersonalOnboarding(person);
  const communityId = sql("select id from feed_data.communities where slug='ouest'");
  sql(`insert into feed_data.community_memberships(community_id,user_id)
    values ('${communityId}','${host.id}'), ('${communityId}','${viewer.id}');`);
  await apiCall(viewer, "/api/v1/members/" + host.handle + "/follow", 200, "PUT");

  const base = "/api/v1/events";
  const timing = Date.now();
  const prefix = "Scope test " + randomUUID().slice(0, 8);
  const titles = {
    community: prefix + " community workshop",
    following: prefix + " member story circle",
    past: prefix + " past cleanup",
    draft: prefix + " planning draft",
  };
  const input = {
    version: null, organizationId: null, projectId: null, description: "Fictional event for tab coverage",
    category: "community", format: "online", startsAt: new Date(timing + 86_400_000).toISOString(),
    endsAt: new Date(timing + 90_000_000).toISOString(), timeZone: "America/Port-au-Prince", country: null,
    department: null, locality: null, venue: null, meetingUrl: null, coverUrl: null, capacity: null, language: "en",
  };

  const { event: community } = await apiCall(host, base, 200, "POST", {
    ...input, request: randomUUID(), title: titles.community, visibility: "community", communityId,
  });
  await apiCall(host, base + "/" + community.id + "/status", 200, "POST", { status: "published", version: community.version });
  await apiCall(viewer, base + "/" + community.id + "/rsvp", 200, "PUT", { response: "going", listMe: false });
  await apiCall(outsider, base + "/" + community.id, 404);
  const { event: open } = await apiCall(host, base, 200, "POST", {
    ...input, request: randomUUID(), title: titles.following, visibility: "public", communityId,
  });
  const openPath = base + "/" + open.id;
  await apiCall(host, openPath + "/status", 200, "POST", { status: "published", version: open.version });
  const guest = await (await fetch(api + openPath)).json();
  expect(guest.event).toMatchObject({ visibility: "public", communityId, communityName: "Ouest", canRsvp: false });
  expect((await apiCall(outsider, openPath, 200)).event.canRsvp).toBe(true);
  await apiCall(outsider, openPath + "/rsvp", 200, "PUT", { response: "going", listMe: false });
  expect((await apiCall(outsider, base + "?scope=communities", 200)).page).toEqual([]);

  const { event: past } = await apiCall(host, base, 200, "POST", {
    ...input, request: randomUUID(), title: titles.past, visibility: "members", communityId: null,
  });
  const pastStatus = base + "/" + past.id + "/status";
  const { event: published } = await apiCall(host, pastStatus, 200, "POST", { status: "published", version: past.version });
  // Move the already published fixture into the past to exercise the normal completion action.
  sql(`update feed_data.events set starts_at=now()-interval '2 hours', ends_at=now()-interval '1 hour' where id='${past.id}';`);
  await apiCall(host, pastStatus, 200, "POST", { status: "completed", version: published.version });

  await inEnglish(page.context());
  await login(page, viewer);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/events/new");
  const form = page.locator("form");
  await form.locator('[name="title"]').fill(titles.draft);
  await form.locator('[name="description"]').fill(input.description);
  await form.locator('[name="format"]').selectOption("online");
  const audience = form.locator('[name="visibility"]');
  const linkedCommunity = form.locator('[name="communityId"]');
  await audience.selectOption("community");
  await expect(linkedCommunity).toHaveAttribute("required", "");
  await linkedCommunity.selectOption(communityId);
  await audience.selectOption("members");
  await expect(linkedCommunity).not.toHaveAttribute("required", "");
  await expect(linkedCommunity).toHaveValue(communityId);
  await form.locator('[name="timeZone"]').fill("UTC");
  await form.locator('[name="startsAt"]').fill(input.startsAt.slice(0, 16));
  await form.locator('[name="endsAt"]').fill(input.endsAt.slice(0, 16));
  await form.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: titles.draft })).toBeVisible();
  await expect(page.getByText("Linked community · Ouest")).toBeVisible();
  await expect(page.getByText("Any signed-in AyiNou member can RSVP.")).toBeVisible();
  await page.goto("/events");
  const navigation = page.getByRole("navigation", { name: "Events", exact: true });
  for (const [tab, expected] of [
    ["Upcoming", [titles.community, titles.following]],
    ["Following", [titles.community, titles.following]],
    ["My communities", [titles.community, titles.following]],
    ["Past", [titles.past]],
    ["My RSVPs", [titles.community]],
    ["Organizing", [titles.draft]],
  ] as const) {
    const link = navigation.getByRole("link", { name: tab, exact: true });
    if (tab !== "Upcoming") await link.click();
    await expect(link).toHaveAttribute("aria-current", "page");
    const rows = page.getByRole("link", { name: new RegExp(prefix) });
    await expect(rows).toHaveCount(expected.length);
    for (const title of expected) await expect(rows.filter({ hasText: title })).toBeVisible();
  }
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
