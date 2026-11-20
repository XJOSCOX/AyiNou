create function public.my_group_activity_for_client(p_view text,p_search text,p_after text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); needle text:=nullif(lower(btrim(p_search)),'');
begin
  if not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  if p_view is null or p_view not in ('joined','managed','pending') or p_limit is null or p_limit not between 1 and 24
    or char_length(needle)>80 or char_length(coalesce(p_after,''))>40
  then raise exception 'invalid group view' using errcode='22023'; end if;
  return coalesce((
    select jsonb_agg(feed_data.group_card(c) order by c.slug) from (
      select c.* from (
        select m.community_id from feed_data.community_memberships m where m.user_id=actor and p_view in ('joined','managed')
        union all
        select r.community_id from feed_data.group_requests r where r.user_id=actor and r.status='pending' and p_view='pending'
      ) own join feed_data.communities c on c.id=own.community_id
      where c.kind<>'department' and c.slug>coalesce(p_after,'')
        and (needle is null or strpos(lower(c.name),needle)>0 or strpos(c.slug,needle)>0)
        and case p_view when 'pending' then c.policy='approval' and feed_data.community_discoverable(c,actor)
          and not feed_data.community_member(c.id,actor)
          when 'managed' then feed_data.group_role(c,actor) in ('owner','administrator','moderator')
          else true end
      order by c.slug limit p_limit+1
    ) c
  ),'[]');
end;
$$;
revoke all on function public.my_group_activity_for_client(text,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.my_group_activity_for_client(text,text,text,integer) to authenticated;

create or replace function public.member_groups_for_client(p_kind text,p_mine boolean,p_search text,p_country text,p_topic text,p_after text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_limit is null or p_limit not between 1 and 24 or char_length(coalesce(p_search,''))>80
    or char_length(coalesce(p_after,''))>40 or (p_kind is not null and p_kind not in ('interest','diaspora'))
  then raise exception 'invalid group search' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(feed_data.group_card(c) order by c.slug) from (
    select * from feed_data.communities c where c.kind<>'department'
      and (case when p_mine then feed_data.member_allowed() and feed_data.community_member(c.id,auth.uid())
        else c.policy<>'private' and feed_data.community_discoverable(c,auth.uid()) end)
      and (p_kind is null or c.kind=p_kind) and (p_country is null or c.country_code=p_country)
      and (p_topic is null or c.topic=p_topic) and c.slug>coalesce(p_after,'')
      and (p_search is null or strpos(lower(c.name),lower(p_search))>0 or strpos(c.slug,lower(p_search))>0)
    order by c.slug limit p_limit+1
  ) c),'[]');
end;
$$;
