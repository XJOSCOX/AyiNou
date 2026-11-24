"use client";

import Link from "next/link";
import { useCallback } from "react";
import { feedMessages } from "@/lib/feed-i18n";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { useLocale } from "@/lib/locale-store";
import { mediaNotificationMessages } from "@/lib/media-notification-i18n";
import { loadLinkedComment, loadPostDetail } from "@/lib/notification-api";
import { ApiErrorNotice } from "./api-error-notice";
import { PostAuthorAvatar } from "./feed-avatar";
import { FounderVerifiedMark } from "./founder-verified-badge";
import { PostDiscussion, ReactionPicker } from "./feed-discussion";
import { institutionCard, institutionLink, useInstitutionResource, PersonalClaimChecks } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { OrganizationPostBadges, QuotePreview, SocialPostControls } from "./social-post";
import { TranslatableText, TranslationEnabled } from "./feed-languages";
import { loadFeedLanguages } from "@/lib/feed-languages-api";
import { SocialText } from "./social-text";
import { PostMediaGallery } from "./post-media";

export function PostDetail({ id, comment }: { id: string; comment?: string }) {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  const f = feedMessages[locale];
  const load = useCallback((signal: AbortSignal) => loadPostDetail(id, signal), [id]);
  const resource = useInstitutionResource(load);
  const post = resource.data?.post;
  const name = post?.social?.organization?.name ?? post?.author?.displayName ?? (post?.own ? f.you : f.unknownAuthor);
  const preferences = useInstitutionResource(loadFeedLanguages);
  return <TranslationEnabled.Provider value={preferences.data?.translationEnabled ?? false}><MemberShell><section className="grid gap-4">
    <Link href={post?.community ? `/communities/${post.community.slug}` : "/feed"} className={`${institutionLink} justify-self-start`}>
      ← {post?.community ? communityDirectoryMessages[locale].back : f.backToFeed}
    </Link>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!post && resource.error === null && <p role="status">{t.working}</p>}
    {post && <article className={institutionCard}>
      <header className="flex min-w-0 items-center gap-3">
        <PostAuthorAvatar post={post} name={name} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="min-w-0 break-words text-xl font-semibold">
              {post.social?.organization ? <Link className="hover:underline" href={"/organization/" + post.social.organization.handle}>{name}</Link> : name}
              {!!post.author?.personalClaims?.length && <>{" "}<PersonalClaimChecks claims={post.author.personalClaims} /></>}
              {post.author?.founderVerified && <>{" "}<FounderVerifiedMark compact /></>}
            </h1>
            <OrganizationPostBadges post={post} />
          </div>
          {post.social?.organization && <span className="me-2 text-sm text-[var(--theme-body)]">@{post.social.organization.handle} ·</span>}
          <time className="text-sm text-[var(--theme-body)]" dateTime={post.publishedAt ?? post.createdAt}>
            {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(post.publishedAt ?? post.createdAt))}
          </time>
        </div>
      </header>
      <TranslatableText key={post.version} kind="post" id={post.id} language={post.language} allowed={post.visibility === "public" && post.status === "published" && !post.community && !post.social?.event} mentions={post.social?.mentions} hashtags={post.social?.hashtags} className="mt-4 whitespace-pre-wrap break-words leading-6"><SocialText body={post.body} mentions={post.social?.mentions} hashtags={post.social?.hashtags} /></TranslatableText>
      {post.attachments && <PostMediaGallery post={post.id} attachments={post.attachments} />}
      <QuotePreview post={post} />
      <SocialPostControls post={post} onChange={resource.refresh} />
      {comment && <LinkedComment post={post.id} id={comment} />}
      {post.reactions && <PostDiscussion postId={post.id}><ReactionPicker target="posts" id={post.id} summary={post.reactions} /></PostDiscussion>}
    </article>}
  </section></MemberShell></TranslationEnabled.Provider>;
}

function LinkedComment({ post, id }: { post: string; id: string }) {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  const load = useCallback((signal: AbortSignal) => loadLinkedComment(post, id, signal), [post, id]);
  const resource = useInstitutionResource(load);
  const comment = resource.data?.comment;
  return <section className="mt-4 rounded-md border border-[var(--theme-border)] bg-[var(--theme-selected)] p-3">
    <h2 className="mb-2 text-sm font-semibold">{t.linkedComment}</h2>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!comment && resource.error === null && <p role="status">{t.working}</p>}
    {comment && <TranslatableText key={comment.body} kind="comment" id={comment.id} language={comment.language} mentions={comment.mentions} className="whitespace-pre-wrap break-words text-sm"><SocialText body={comment.body} mentions={comment.mentions} /></TranslatableText>}
  </section>;
}
