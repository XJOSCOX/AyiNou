alter table feed_data.posts add column published_at timestamptz;
update feed_data.posts set published_at=created_at where status<>'draft';
alter table feed_data.posts add constraint posts_publication_time_check check ((status='draft')=(published_at is null));

create function feed_data.stamp_publication()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status='draft' then new.published_at:=null;
  elsif tg_op='INSERT' then new.published_at:=new.created_at;
  elsif old.status='draft' then new.published_at:=clock_timestamp();
  else new.published_at:=old.published_at;
  end if;
  return new;
end;
$$;
revoke all on function feed_data.stamp_publication() from public,anon,authenticated,service_role;
create trigger posts_publication_time before insert or update of status on feed_data.posts
  for each row execute function feed_data.stamp_publication();

create or replace function public.read_feed_for_client(p_scope text,p_limit integer,p_before_at timestamptz,p_before_id uuid,p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_scope is null or p_scope not in ('feed','mine') or p_limit is null or p_limit not between 1 and 40
    or ((p_before_at is null)<>(p_before_id is null))
  then raise exception 'invalid page' using errcode='22023'; end if;
  if p_scope='mine' and not feed_data.member_allowed() then raise exception 'authentication required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'body',p.body,'language',p.language,'visibility',p.visibility,'status',p.status,
    'createdAt',p.created_at,'publishedAt',p.published_at,'editedAt',p.edited_at,'version',p.version,
    'own',coalesce(p.author_id=auth.uid(),false),'author',feed_data.author_projection(p.author_id)
  ) order by p.created_at desc,p.id desc) from (
    select * from feed_data.posts x where (p_id is null or x.id=p_id)
      and (p_id is not null or (p_scope='mine' and x.author_id=auth.uid()) or (p_scope='feed' and x.status='published'))
      and (p_before_at is null or (x.created_at,x.id)<(p_before_at,p_before_id))
    order by x.created_at desc,x.id desc limit p_limit+1
  ) p),'[]'::jsonb);
end;
$$;
