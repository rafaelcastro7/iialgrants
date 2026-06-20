create or replace function public.validate_grant_transition()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  valid boolean := false;
begin
  if TG_OP <> 'UPDATE' then return new; end if;
  if new.status = old.status then return new; end if;
  valid := case old.status
    when 'discovered'  then new.status in ('enriched','scored','archived','expired')
    when 'enriched'    then new.status in ('scored','archived','expired')
    when 'scored'      then new.status in ('shortlisted','archived','expired')
    when 'shortlisted' then new.status in ('in_proposal','archived','expired')
    when 'in_proposal' then new.status in ('submitted','archived','expired')
    when 'submitted'   then new.status in ('won','lost','expired')
    when 'won'         then false
    when 'lost'        then false
    when 'expired'     then new.status = 'archived'
    when 'archived'    then false
    else false
  end;
  if not valid then
    raise exception 'invalid grant state transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;