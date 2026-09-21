-- Allow Grant Reactivation and Re-opening Transitions
-- Enables recurring grants and renewed programs to transition from expired/archived back to discovered/enriched.

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
    when 'enriched'    then new.status in ('scored','archived','expired','discovered')
    when 'scored'      then new.status in ('shortlisted','archived','expired','discovered','enriched')
    when 'shortlisted' then new.status in ('in_proposal','archived','expired','discovered')
    when 'in_proposal' then new.status in ('submitted','archived','expired','discovered')
    when 'submitted'   then new.status in ('won','lost','expired','discovered')
    when 'won'         then new.status in ('archived','discovered')
    when 'lost'        then new.status in ('archived','discovered')
    when 'expired'     then new.status in ('archived','discovered','enriched')
    when 'archived'    then new.status in ('discovered','expired')
    else false
  end;
  if not valid then
    raise exception 'invalid grant state transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;
