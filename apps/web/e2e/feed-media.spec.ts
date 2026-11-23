import sharp from "sharp";
import { expect, test } from "./fixtures";
import { feedMessages } from "../src/lib/feed-i18n";
import { mediaNotificationMessages } from "../src/lib/media-notification-i18n";

test("published post opens its image, accepts a comment and updates its reaction", async ({ page, signedIn }) => {
  const t = feedMessages.en;
  const m = mediaNotificationMessages.en;
  const alt = "A blue workshop illustration";
  const body = "Browser fixture post with an accessible image.";
  const comment = "A comment on the workshop.";
  await page.goto("/feed");
  const composer = page.getByRole("region", { name: t.write });
  await composer.getByRole("textbox", { name: t.body }).fill(body);
  const buffer = await sharp({ create: { width: 96, height: 64, channels: 3, background: "#2675ad" } }).png().toBuffer();
  await composer.getByLabel(m.add).setInputFiles({ name: "workshop.png", mimeType: "image/png", buffer });
  await composer.getByRole("textbox", { name: m.alt + " · " + m.image.replace("{n}", "1"), exact: true }).fill(alt);
  await expect(composer.getByRole("img", { name: alt })).toBeVisible();
  await composer.getByRole("button", { name: t.publish, exact: true }).click();

  const article = page.getByRole("article").filter({ hasText: body });
  await article.getByRole("button", { name: m.open.replace("{n}", "1"), exact: true }).click();
  const dialog = page.getByRole("dialog", { name: alt, exact: true });
  await expect(dialog.getByRole("img", { name: alt, exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: m.close, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await article.getByRole("button", { name: t.comments, exact: true }).click();
  await article.getByRole("textbox", { name: t.writeComment, exact: true }).fill(comment);
  await article.getByRole("button", { name: t.sendComment, exact: true }).click();
  await expect(article.getByText(comment, { exact: true })).toBeVisible();
  const reactions = article.getByRole("button", { name: t.reactions, exact: true }).first();
  await reactions.focus();
  await reactions.press("Enter");
  await article.getByRole("button", { name: t.like + " 0", exact: true }).click();
  await expect(article.getByRole("button", { name: t.reactionPicked + " " + t.like })).toBeVisible();
  expect(signedIn.handle).toMatch(/^e2e_/);
});

test("F2.2 restores drafts, navigates a three-image gallery, and keeps reply context", async ({ page, signedIn }) => {
  expect(signedIn.handle).toMatch(/^e2e_/);
  const t = feedMessages.en;
  const m = mediaNotificationMessages.en;
  await page.goto("/feed");
  const composer = page.getByRole("region", { name: t.write });
  await composer.getByRole("textbox", { name: t.body }).fill("A draft that survives leaving the Feed.");
  await composer.getByRole("combobox", { name: t.visibility }).selectOption("private");
  await page.goto("/discover");
  await page.goto("/feed");
  await expect(composer.getByRole("textbox", { name: t.body })).toHaveValue("A draft that survives leaving the Feed.");
  await expect(composer.getByRole("combobox", { name: t.visibility })).toHaveValue("private");
  await composer.getByRole("textbox", { name: t.body }).fill("Three photos and a conversation.");
  await composer.getByRole("combobox", { name: t.visibility }).selectOption("public");
  const buffers = await Promise.all(["#2075ad", "#bb722c", "#5c8c3a"].map((background) =>
    sharp({ create: { width: 120, height: 80, channels: 3, background } }).png().toBuffer()));
  await composer.getByLabel(m.add).setInputFiles(buffers.map((buffer, index) =>
    ({ name: "gallery-" + index + ".png", mimeType: "image/png", buffer })));
  for (const index of [1, 2, 3]) {
    await composer.getByRole("textbox", { name: m.alt + " · " + m.image.replace("{n}", String(index)), exact: true })
      .fill("Gallery image " + index);
  }
  await composer.getByRole("button", { name: t.publish, exact: true }).click();
  const article = page.getByRole("article").filter({ hasText: "Three photos and a conversation." });
  await article.getByRole("button", { name: m.open.replace("{n}", "1") }).click();
  const dialog = page.getByRole("dialog", { name: "Gallery image 1" });
  await expect(dialog.getByRole("img", { name: "Gallery image 1" })).toBeVisible();
  await dialog.getByRole("button", { name: m.next }).click();
  await expect(page.getByRole("dialog", { name: "Gallery image 2" }).getByRole("img", { name: "Gallery image 2" })).toBeVisible();
  await page.getByRole("dialog", { name: "Gallery image 2" }).getByRole("button", { name: m.next }).click();
  const last = page.getByRole("dialog", { name: "Gallery image 3" });
  await expect(last.getByRole("button", { name: m.next })).toBeDisabled();
  await last.getByRole("button", { name: m.close }).press("ArrowLeft");
  await expect(page.getByRole("dialog", { name: "Gallery image 2" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: m.close }).press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await article.getByRole("button", { name: t.comments, exact: true }).click();
  await article.getByRole("textbox", { name: t.writeComment }).fill("A parent comment.");
  await article.getByRole("button", { name: t.sendComment }).click();
  await expect(article.getByText("A parent comment.")).toBeVisible();
  await article.getByRole("button", { name: t.reply, exact: true }).click();
  await expect(article.getByText(/^Replying to /)).toBeVisible();
  await article.getByRole("textbox", { name: t.writeReply }).fill("A contextual reply.");
  await article.getByRole("button", { name: t.sendReply }).click();
  await expect(article.getByText("A contextual reply.")).toBeVisible();
  await article.getByRole("button", { name: t.hideReplies }).click();
  await expect(article.getByText("A contextual reply.")).toBeHidden();
  await article.getByRole("button", { name: t.showReplies }).click();
  await expect(article.getByText("A contextual reply.")).toBeVisible();
});
