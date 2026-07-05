create or replace function public.bump_proposal_version(target_proposal_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_version integer;
begin
  update public.proposals
     set version = greatest(coalesce(version, 1), 1) + 1
   where id = target_proposal_id
     and user_id = auth.uid()
   returning version into next_version;

  if next_version is null then
    raise exception 'proposal_not_found_or_forbidden'
      using errcode = 'P0002';
  end if;

  return next_version;
end;
$$;

revoke all on function public.bump_proposal_version(uuid) from public;
grant execute on function public.bump_proposal_version(uuid) to authenticated, service_role;
