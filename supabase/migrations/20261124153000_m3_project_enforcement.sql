-- Keep original and amended proposals under the same project-creation restriction.
-- Apply the check before the native write's audit and notification commit.
create function private.m3_guard_project_submission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.m23_resource_guard(new.actor_id,'project_create','project',new.project_id);
  return new;
end
$$;

revoke all on function private.m3_guard_project_submission() from public,anon,authenticated,service_role;

create trigger m3_project_submission_guard before insert on private.project_events
for each row when (new.action in ('submit','publish'))
execute function private.m3_guard_project_submission();
