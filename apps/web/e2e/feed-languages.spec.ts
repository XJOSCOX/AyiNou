import { api, apiCall, expect, finishPersonalOnboarding, inEnglish, login, sql, test } from "./fixtures";
import { feedLanguageMessages } from "../src/lib/feed-language-i18n";
import { eventMessages } from "../src/lib/events-i18n";

test("F2.5 filters timelines without changing original language or direct access and keeps translation provider off", async ({ makeMember, page }) => {
  test.setTimeout(90_000);
  const [author,reader] = await Promise.all([makeMember({ visible:true }),makeMember({ visible:true })]);
  finishPersonalOnboarding(author); finishPersonalOnboarding(reader);
  const posts = await Promise.all(Object.entries({ ht:"Bonjou tout moun",fr:"Bonjour à tous",en:"Hello everyone",es:"Hola a todos" })
    .map(([language,body]) => apiCall(author,"/api/v1/posts",201,"POST",{ language,body,visibility:"public" })));
  const privatePost = await apiCall(author,"/api/v1/posts",201,"POST",{ language:"fr",body:"Private draft source",visibility:"private" });
  const pref = "/api/v1/me/feed-languages";
  expect((await fetch(api + pref)).status).toBe(401);
  expect(await apiCall(reader,pref,200)).toEqual({ languages:[],enabled:true,translationEnabled:false });
  await apiCall(reader,"/api/v1/members/" + author.handle + "/follow",200,"PUT");
  await apiCall(reader,pref,200,"PUT",{ languages:["ht","es"] });
  for (const scope of ["feed","following","for_you"]) {
    const timeline = await apiCall(reader,"/api/v1/feed?scope=" + scope,200);
    expect(timeline.posts.filter(({id}: {id:string}) => posts.some((post) => post.id===id))
      .map(({language}: {language:string}) => language).sort()).toEqual(["es","ht"]);
  }
  expect((await apiCall(reader,"/api/v1/posts/" + posts[1].id,200)).post)
    .toMatchObject({ language:"fr",body:"Bonjour à tous" });
  const route = "/api/v1/feed/translation";
  const translate = (id: string, status: number) => apiCall(reader,route,status,"POST",{ kind:"post",id,language:"en" });
  expect(await translate(posts[1].id,200)).toEqual({ status:"unavailable" });
  await translate(privatePost.id,404);
  sql("update private.platform_boolean_policies set enabled=true where policy_key='feed.translation';");
  try {
    expect(await translate(posts[1].id,200)).toEqual({ status:"unavailable" });
    await translate(privatePost.id,404);
    const comment = await apiCall(author,"/api/v1/posts/" + posts[1].id + "/comments",201,"POST",{ body:"Merci beaucoup",language:"fr" });
    expect(await apiCall(reader,route,200,"POST",{ kind:"comment",id:comment.id,language:"en" })).toEqual({ status:"unavailable" });
    await inEnglish(page.context()); await login(page,reader); await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/feed");
    await expect(page.getByText("Showing posts in Español, Kreyòl ayisyen")).toBeVisible();
    await page.goto("/posts/" + posts[1].id);
    await expect(page.getByText("Bonjour à tous",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Translate",exact:true}).first().click();
    await expect(page.getByText("Translation is currently unavailable.")).toBeVisible();
  } finally {
    sql("update private.platform_boolean_policies set enabled=false where policy_key='feed.translation';");
  }
});

test("F2.5 supplies valid language and event controls in all four locales", () => {
  for (const locale of ["ht","fr","en","es"] as const) {
    expect(eventMessages[locale].create.length).toBeGreaterThan(6);
    expect(eventMessages[locale].privateDetails.length).toBeGreaterThan(25);
    expect(Object.keys(feedLanguageMessages[locale].features)).toHaveLength(8);
    expect(feedLanguageMessages[locale].unavailable.length).toBeGreaterThan(12);
  }
});
