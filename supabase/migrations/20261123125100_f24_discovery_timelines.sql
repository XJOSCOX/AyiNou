create extension if not exists pg_trgm with schema extensions;
create index f24_discovery_name_trgm on public.profiles using gin (lower(display_name) extensions.gin_trgm_ops)
  where is_visible and username is not null;
create index f24_discovery_username_trgm on public.profiles using gin (username extensions.gin_trgm_ops)
  where is_visible and username is not null;
create index f24_post_search on feed_data.posts using gin (to_tsvector('simple'::regconfig,body))
  where status='published' and deleted_at is null;
create index f24_member_post_page on feed_data.posts(author_id,created_at desc,id desc)
  where status='published' and deleted_at is null and organization_id is null and community_id is null;
create index f24_member_reply_page on feed_data.comments(author_id,created_at desc,id desc)
  where status='published' and deleted_at is null;

create or replace function feed_data.member_card(p public.profiles)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id','member:'||p.username,'kind','member','handle',p.username,'name',p.display_name,
    'self',p.user_id=auth.uid(),'personalClaims',case when d.visible then private.reviewed_personal_claims(p.user_id) end,
    'verified',d.visible and cardinality(private.reviewed_personal_claims(p.user_id))>0,
    'avatarPath',case when d.visible and private.member_experience_flag('profilePictures') and p.avatar_asset is not null
      then p.user_id::text||'/'||p.avatar_asset::text||'.webp' end,
    'following',d.state->'following','requestPending',d.state->'requestPending',
    'requiresApproval',d.state->'requiresApproval','canFollow',d.state->'canFollow')
  || case when d.visible and feed_data.followable_member(p) and public.founder_identity_public_for_api(p.user_id)
    then jsonb_build_object('founderVerified',true) else '{}'::jsonb end
  from (select feed_data.f24_details(p.user_id,auth.uid()) visible,
    feed_data.f24_member_follow_status(p) state) d
$$;

create function public.search_members_f24_for_client(p_search text,p_verified boolean,p_country text,p_department text,
  p_interest text,p_language text,p_after text,p_limit int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q text:=lower(btrim(coalesce(p_search,''))); needle text;
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  perform feed_data.consume_limit(auth.uid(),'discovery_search',90);
  if char_length(q)=1 or char_length(q)>80 or q ~ '[[:cntrl:]@]'
    or p_limit is null or p_limit not between 1 and 20
    or char_length(coalesce(p_after,''))>24 then raise exception 'invalid search' using errcode='22023'; end if;
  needle:='%'||replace(replace(replace(q,'!','!!'),'%','!%'),'_','!_')||'%';
  return coalesce((select jsonb_agg(feed_data.member_card(candidate) order by candidate.username)
    from (select p.* from public.profiles p join public.user_settings s using(user_id)
      join public.member_private m using(user_id) left join feed_data.profile_privacy a using(user_id)
      where p.is_visible and p.username>coalesce(p_after,'') and p.display_name is not null
        and feed_data.followable_member(p)
        and (q='' or p.username like needle escape '!' or lower(p.display_name) like needle escape '!'
          or (char_length(q) between 3 and 32 and lower(p.display_name) operator(extensions.%>) q))
        and (not coalesce(p_verified,false) or cardinality(private.reviewed_personal_claims(p.user_id))>0)
        and (p_country is null or (s.show_country and private.member_experience_flag('displayCountry') and m.residence_country_code=p_country))
        and (p_department is null or (s.show_department and private.member_experience_flag('displayDepartment')
          and coalesce(m.residence_department_code,m.diaspora_department_code)=p_department))
        and (p_interest is null or (s.show_interests and private.member_experience_flag('displayInterests')
          and exists(select from public.member_interests i where i.user_id=p.user_id and i.interest_code=p_interest)))
        and (p_language is null or (a.share_language and p.preferred_locale=p_language))
      order by p.username limit p_limit+1) candidate),'[]'::jsonb);
end
$$;

create function public.read_f24_posts_for_client(p_username text,p_filter text,p_query text,p_tag text,
  p_language text,p_topic text,p_since timestamptz,p_before_at timestamptz,p_before_id uuid,p_limit int)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); subject uuid; q text:=btrim(coalesce(p_query,''));
begin
  if viewer is not null and not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_filter is null or p_filter not in ('posts','media') or p_limit is null or p_limit not between 1 and 20
    or char_length(q)>100 or char_length(q)=1 or ((p_before_at is null)<>(p_before_id is null))
    or (p_username is null and (viewer is null or (q='' and p_tag is null and p_topic is null and p_language is null and p_since is null)))
    then raise exception 'invalid page' using errcode='22023'; end if;
  if p_username is not null then
    select p.user_id into subject from public.profiles p left join feed_data.profile_privacy s using(user_id)
      where p.username=p_username and feed_data.f24_identity(p,viewer) and feed_data.f24_details(p.user_id,viewer)
      and coalesce(s.show_activity,false);
    if not found then return '[]'::jsonb; end if;
  end if;
  return coalesce((select jsonb_agg(feed_data.f21_card(p) order by p.created_at desc,p.id desc) from (
    select x.* from feed_data.posts x
    where x.status='published' and x.deleted_at is null and x.community_id is null
      and (subject is null or (x.author_id=subject and x.organization_id is null))
      and feed_data.discussion_visible(x) and feed_data.viewer_unmuted(x.author_id)
      and (p_language is null or x.language=p_language)
      and (p_since is null or x.created_at>=p_since)
      and (q='' or to_tsvector('simple'::regconfig,x.body) @@ websearch_to_tsquery('simple'::regconfig,q))
      and (p_tag is null or exists(select from feed_data.post_hashtags h where h.post_id=x.id and h.tag=p_tag))
      and (p_topic is null or exists(select from feed_data.post_topics t where t.post_id=x.id and t.topic_code=p_topic))
      and (p_filter='posts' or exists(select from feed_data.post_attachments m where m.post_id=x.id))
      and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
    order by x.created_at desc,x.id desc limit p_limit+1
  ) p),'[]'::jsonb);
end
$$;

create function public.read_member_replies_f24_for_client(p_username text,p_before_at timestamptz,p_before_id uuid,p_limit int)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); subject uuid;
begin
  if viewer is not null and not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 20 or ((p_before_at is null)<>(p_before_id is null))
    then raise exception 'invalid page' using errcode='22023'; end if;
  select p.user_id into subject from public.profiles p left join feed_data.profile_privacy s using(user_id)
    where p.username=p_username and feed_data.f24_identity(p,viewer) and feed_data.f24_details(p.user_id,viewer)
    and coalesce(s.show_activity,false);
  if not found then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'postId',c.post_id,'body',c.body,'language',c.language,
    'createdAt',c.created_at,'mentions',feed_data.f21_mention_links(c.post_id,c.id)) order by c.created_at desc,c.id desc)
    from (select x.* from feed_data.comments x join feed_data.posts p on p.id=x.post_id
      where x.author_id=subject and x.status='published' and x.deleted_at is null and p.community_id is null
        and feed_data.discussion_visible(p) and feed_data.comment_visible(x)
        and feed_data.viewer_unmuted(p.author_id) and feed_data.viewer_unmuted(x.author_id)
        and (x.parent_id is null or exists(select from feed_data.comments parent
          where parent.id=x.parent_id and feed_data.comment_visible(parent)))
        and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
      order by x.created_at desc,x.id desc limit p_limit+1) c),'[]'::jsonb);
end
$$;

create function public.trending_hashtags_f24_for_client() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(x.tag order by x.contributors desc,x.tag)
    from (select h.tag,count(distinct p.author_id) contributors
      from (select x.* from feed_data.posts x where x.status='published' and x.visibility='public'
        and x.deleted_at is null and x.community_id is null and x.created_at>=now()-interval '7 days'
        order by x.created_at desc,x.id desc limit 5000) p
      join feed_data.post_hashtags h on h.post_id=p.id
      where feed_data.f21_shareable(p) and feed_data.viewer_unmuted(p.author_id)
      group by h.tag having count(distinct p.author_id)>=3
      order by contributors desc,h.tag limit 12) x),'[]'::jsonb);
end
$$;

revoke all on function public.search_members_f24_for_client(text,boolean,text,text,text,text,text,int),
  public.read_f24_posts_for_client(text,text,text,text,text,text,timestamptz,timestamptz,uuid,int),
  public.read_member_replies_f24_for_client(text,timestamptz,uuid,int),public.trending_hashtags_f24_for_client()
  from public,anon,authenticated,service_role;
grant execute on function public.search_members_f24_for_client(text,boolean,text,text,text,text,text,int),
  public.trending_hashtags_f24_for_client() to authenticated;
grant execute on function public.read_f24_posts_for_client(text,text,text,text,text,text,timestamptz,timestamptz,uuid,int),
  public.read_member_replies_f24_for_client(text,timestamptz,uuid,int) to anon,authenticated;
