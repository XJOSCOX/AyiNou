-- Keep the global directory on its existing ordered scan. Each scoped branch
-- can use the matching partial index even with a cached generic query plan.
create or replace function public.polls_for_client(
  p_mine boolean,p_scope text,p_scope_id uuid,p_before timestamptz,p_before_id uuid
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if not feed_data.member_allowed() then raise exception 'access denied' using errcode='42501'; end if;
  if p_mine is null or ((p_scope is null)<>(p_scope_id is null)) or ((p_before is null)<>(p_before_id is null))
    or (p_scope is not null and p_scope not in ('community','organization','project')) then
    raise exception 'invalid listing' using errcode='PVG03'; end if;
  if p_scope is null then
    return coalesce((select jsonb_agg(private.poll_card(p) order by p.created_at desc,p.id desc)
      from (select x.* from private.polls x where
        (case when p_mine then private.poll_can_manage(x,actor)
          else x.status in ('published','closed') and private.poll_can_read(x,actor) end)
        and (p_before is null or (x.created_at,x.id)<(p_before,p_before_id))
        order by x.created_at desc,x.id desc limit 21) p),'[]');
  end if;
  return coalesce((select jsonb_agg(private.poll_card(p.poll) order by p.created_at desc,p.id desc)
    from (select x.poll,x.created_at,x.id from (
      select c as poll,c.created_at,c.id,c.status from private.polls c
        where p_scope='community' and c.scope='community' and c.community_id=p_scope_id
      union all
      select o as poll,o.created_at,o.id,o.status from private.polls o
        where p_scope='organization' and o.scope='organization' and o.organization_id=p_scope_id
      union all
      select j as poll,j.created_at,j.id,j.status from private.polls j
        where p_scope='project' and j.scope='project' and j.project_id=p_scope_id
    ) x where (case when p_mine then private.poll_can_manage(x.poll,actor)
        else x.status in ('published','closed') and private.poll_can_read(x.poll,actor) end)
      and (p_before is null or (x.created_at,x.id)<(p_before,p_before_id))
      order by x.created_at desc,x.id desc limit 21) p),'[]');
end;
$$;
