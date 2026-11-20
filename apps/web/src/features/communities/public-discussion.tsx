import { GroupMore } from "./group-controls";
import { ApiErrorNotice } from "@/components/api-error-notice";
import { institutionLink, institutionCard } from "@/components/institution-ui";
import { PostMediaGallery } from "@/components/post-media";
import { publicRequest } from "@/lib/api";
import { communityDirectoryMessages } from "@/lib/communities-i18n";
import { loadDepartmentFeed } from "@/lib/department-community-api";
import { feedMessages } from "@/lib/feed-i18n";
import { useCursorPage } from "@/lib/feed-state";
import { useLocale } from "@/lib/locale-store";
import { type FeedComment, type FeedPost } from "@ayinou/shared";
import Link from "next/link";
import { useCallback, useState } from "react";

function GuestComments({ post, parent }: { post: string; parent?: string }) {
  const [locale] = useLocale();
  const t = feedMessages[locale];
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const query = new URLSearchParams();
    if (cursor) query.set("cursor", cursor);
    if (parent) query.set("parent", parent);
    const page: { comments: FeedComment[]; nextCursor: string | null } = await publicRequest(`/api/v1/posts/${post}/comments?${query}`, { signal });
    return { rows: page.comments, nextCursor: page.nextCursor };
  }, [parent, post]);
  const resource = useCursorPage(load);
  return <div className="mt-2 grid gap-2 border-s border-[var(--theme-border)] ps-3">
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {resource.page?.rows.length === 0 && <p className="text-sm">{parent ? t.replyEmpty : t.commentEmpty}</p>}
    {resource.error === null && resource.page?.rows.map((comment) => <article key={comment.id}>
      {comment.available && <><p className="text-sm font-semibold">{comment.author?.displayName}</p><p dir="auto" className="whitespace-pre-wrap break-words">{comment.body}</p></>}
      {comment.hasReplies && !parent && <GuestThread post={post} parent={comment.id} />}
    </article>)}
    <GroupMore resource={resource} />
  </div>;
}

function GuestThread({ post, parent }: { post: string; parent?: string }) {
  const [locale] = useLocale();
  const [open, setOpen] = useState(false);
  return <details className="mt-3" onToggle={(event) => { if (event.currentTarget.open) setOpen(true); }}>
    <summary className={`${institutionLink} cursor-pointer`}>{parent ? feedMessages[locale].replies : feedMessages[locale].comments}</summary>
    {open && <GuestComments post={post} parent={parent} />}
  </details>;
}

export function ReadOnlyGroupPost({ post, guest }: { post: FeedPost; guest: boolean }) {
  const [locale] = useLocale();
  return <article className={institutionCard}>
    {post.author && <p className="break-words font-semibold">{post.author.displayName}</p>}
    <time className="text-sm text-[var(--theme-body)]" dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString(locale)}</time>
    <p dir="auto" className="mt-2 whitespace-pre-wrap break-words">{post.body}</p>
    <PostMediaGallery post={post.id} attachments={post.attachments ?? []} guest={guest} />
    {guest ? <GuestThread post={post.id} /> : <Link className={`${institutionLink} mt-3 inline-block`} href={`/posts/${post.id}`}>{feedMessages[locale].comments}</Link>}
  </article>;
}

export function PublicDiscussion({ slug }: { slug: string }) {
  const [locale] = useLocale();
  const t = communityDirectoryMessages[locale];
  const load = useCallback(async (cursor: string | null, signal: AbortSignal) => {
    const page = await loadDepartmentFeed(slug, cursor, signal, true);
    return { rows: page.posts, nextCursor: page.nextCursor };
  }, [slug]);
  const resource = useCursorPage(load);
  return <section className="grid gap-3" aria-label={t.discussion}>
    {resource.error !== null && <ApiErrorNotice error={resource.error} retry={resource.retry} />}
    {!resource.page && resource.error === null && <p role="status">{t.loading}</p>}
    {resource.page?.rows.length === 0 && <p>{t.emptyPosts}</p>}
    {resource.error === null && resource.page?.rows.map((post) => <ReadOnlyGroupPost key={post.id} post={post} guest />)}
    <GroupMore resource={resource} />
  </section>;
}
