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
