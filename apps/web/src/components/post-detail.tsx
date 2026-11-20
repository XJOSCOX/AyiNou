"use client";

import Link from "next/link";
import { useCallback } from "react";
import { feedMessages } from "@/lib/feed-i18n";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { useLocale } from "@/lib/locale-store";
import { mediaNotificationMessages } from "@/lib/media-notification-i18n";
import { loadLinkedComment, loadPostDetail } from "@/lib/notification-api";
import { ApiErrorNotice } from "./api-error-notice";
import { PostDiscussion, ReactionPicker } from "./feed-discussion";
import { institutionCard, institutionLink, useInstitutionResource, VerifiedCheck } from "./institution-ui";
import { MemberShell } from "./member-shell";
import { PostMediaGallery } from "./post-media";

export function PostDetail({ id, comment }: { id: string; comment?: string }) {
  const [locale] = useLocale();
  const t = mediaNotificationMessages[locale];
  const f = feedMessages[locale];
  const load = useCallback((signal: AbortSignal) => loadPostDetail(id, signal), [id]);
  const resource = useInstitutionResource(load);
  const post = resource.data?.post;
  return <MemberShell><section className="grid gap-4">
    <Link href={post?.community ? `/communities/${post.community.slug}` : "/feed"} className={`${institutionLink} justify-self-start`}>
      ← {post?.community ? communityDirectoryMessages[locale].back : f.backToFeed}
    </Link>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.refresh} />}
    {!post && resource.error === null && <p role="status">{t.working}</p>}
    {post && <article className={institutionCard}>
      <h1 className="break-words text-xl font-semibold">{post.author?.displayName ?? (post.own ? f.you : f.unknownAuthor)}
        {post.author?.verified && <>{" "}<VerifiedCheck label={f.verified} /></>}
      </h1>
      <time className="text-sm text-[var(--theme-body)]" dateTime={post.publishedAt ?? post.createdAt}>
        {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(post.publishedAt ?? post.createdAt))}
      </time>
      <p lang={post.language} dir="auto" className="mt-4 whitespace-pre-wrap break-words leading-6">{post.body}</p>
      {post.attachments && <PostMediaGallery post={post.id} attachments={post.attachments} />}
      {comment && <LinkedComment post={post.id} id={comment} />}
      {post.reactions && <PostDiscussion postId={post.id}><ReactionPicker target="posts" id={post.id} summary={post.reactions} /></PostDiscussion>}
    </article>}
  </section></MemberShell>;
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
    {comment && <p lang={comment.language} dir="auto" className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>}
  </section>;
}
