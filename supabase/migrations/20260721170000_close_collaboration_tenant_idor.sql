-- Close cross-tenant IDORs in collaboration/reporting tables.
-- Server functions use service-role access for storage and therefore perform
-- the same ownership checks in application code. These policies are the
-- defense-in-depth boundary for direct authenticated PostgREST access.

create or replace function public.can_access_tenant_entity(
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_entity_type
    when 'grant' then exists (
      select 1 from public.grants r
      where r.id = p_entity_id
        and (
          r.org_id is null
          or r.org_id = (select p.org_id from public.profiles p where p.id = auth.uid())
        )
    )
    when 'funder' then exists (
      select 1 from public.funders r
      where r.id = p_entity_id
        and (
          r.org_id is null
          or r.org_id = (select p.org_id from public.profiles p where p.id = auth.uid())
        )
    )
    when 'proposal' then exists (
      select 1 from public.proposals r
      where r.id = p_entity_id
        and (
          r.user_id = auth.uid()
          or (
            r.org_id is not null
            and r.org_id = (select p.org_id from public.profiles p where p.id = auth.uid())
          )
        )
    )
    when 'submission' then exists (
      select 1 from public.submissions r
      where r.id = p_entity_id
        and (
          r.user_id = auth.uid()
          or (
            r.org_id is not null
            and r.org_id = (select p.org_id from public.profiles p where p.id = auth.uid())
          )
        )
    )
    else false
  end;
$$;

revoke all on function public.can_access_tenant_entity(text, uuid) from public;
grant execute on function public.can_access_tenant_entity(text, uuid) to authenticated;

alter table public.compliance_items
  add column if not exists org_id uuid references public.organizations(id),
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists idx_compliance_items_org_id on public.compliance_items(org_id);
create index if not exists idx_compliance_items_created_by on public.compliance_items(created_by);

update public.compliance_items ci
set org_id = s.org_id,
    created_by = s.user_id
from public.submissions s
where ci.submission_id = s.id
  and ci.org_id is null
  and ci.created_by is null;

drop policy if exists "Authenticated users can view documents" on public.documents;
drop policy if exists "Authenticated users can upload documents" on public.documents;
drop policy if exists "Authenticated users can delete documents" on public.documents;

create policy "Tenant members can view documents"
  on public.documents for select to authenticated
  using (public.can_access_tenant_entity(entity_type, entity_id));
create policy "Tenant members can upload documents"
  on public.documents for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.can_access_tenant_entity(entity_type, entity_id)
  );
create policy "Tenant members can update documents"
  on public.documents for update to authenticated
  using (public.can_access_tenant_entity(entity_type, entity_id))
  with check (public.can_access_tenant_entity(entity_type, entity_id));
create policy "Tenant members can delete documents"
  on public.documents for delete to authenticated
  using (public.can_access_tenant_entity(entity_type, entity_id));

drop policy if exists "Authenticated users can manage tasks" on public.tasks;
create policy "Tenant members can view tasks"
  on public.tasks for select to authenticated
  using (public.can_access_tenant_entity(entity_type, entity_id));
create policy "Tenant members can create tasks"
  on public.tasks for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_access_tenant_entity(entity_type, entity_id)
  );
create policy "Tenant members can update tasks"
  on public.tasks for update to authenticated
  using (public.can_access_tenant_entity(entity_type, entity_id))
  with check (public.can_access_tenant_entity(entity_type, entity_id));
create policy "Tenant members can delete tasks"
  on public.tasks for delete to authenticated
  using (public.can_access_tenant_entity(entity_type, entity_id));

drop policy if exists "Authenticated users can manage comments" on public.comments;
create policy "Tenant members can view comments"
  on public.comments for select to authenticated
  using (public.can_access_tenant_entity(entity_type, entity_id));
create policy "Tenant members can create comments"
  on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.can_access_tenant_entity(entity_type, entity_id)
  );
create policy "Tenant members can update comments"
  on public.comments for update to authenticated
  using (public.can_access_tenant_entity(entity_type, entity_id))
  with check (public.can_access_tenant_entity(entity_type, entity_id));
create policy "Tenant members can delete comments"
  on public.comments for delete to authenticated
  using (public.can_access_tenant_entity(entity_type, entity_id));

drop policy if exists "Authenticated users can manage compliance items" on public.compliance_items;
create policy "Tenant members can view compliance items"
  on public.compliance_items for select to authenticated
  using (
    created_by = auth.uid()
    or (
      org_id is not null
      and org_id = (select p.org_id from public.profiles p where p.id = auth.uid())
    )
    or (
      submission_id is not null
      and public.can_access_tenant_entity('submission', submission_id)
    )
  );
create policy "Tenant members can create compliance items"
  on public.compliance_items for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      (org_id is null and submission_id is null)
      or (
        org_id is not null
        and org_id = (select p.org_id from public.profiles p where p.id = auth.uid())
      )
      or (
        submission_id is not null
        and public.can_access_tenant_entity('submission', submission_id)
      )
    )
  );
create policy "Tenant members can update compliance items"
  on public.compliance_items for update to authenticated
  using (
    created_by = auth.uid()
    or (
      org_id is not null
      and org_id = (select p.org_id from public.profiles p where p.id = auth.uid())
    )
    or (
      submission_id is not null
      and public.can_access_tenant_entity('submission', submission_id)
    )
  )
  with check (
    created_by = auth.uid()
    or (
      org_id is not null
      and org_id = (select p.org_id from public.profiles p where p.id = auth.uid())
    )
  );
create policy "Tenant members can delete compliance items"
  on public.compliance_items for delete to authenticated
  using (
    created_by = auth.uid()
    or (
      org_id is not null
      and org_id = (select p.org_id from public.profiles p where p.id = auth.uid())
    )
  );

drop policy if exists "Authenticated users can manage logic models" on public.logic_models;
create policy "Tenant members can view logic models"
  on public.logic_models for select to authenticated
  using (public.can_access_tenant_entity('proposal', proposal_id));
create policy "Tenant members can create logic models"
  on public.logic_models for insert to authenticated
  with check (public.can_access_tenant_entity('proposal', proposal_id));
create policy "Tenant members can update logic models"
  on public.logic_models for update to authenticated
  using (public.can_access_tenant_entity('proposal', proposal_id))
  with check (public.can_access_tenant_entity('proposal', proposal_id));
create policy "Tenant members can delete logic models"
  on public.logic_models for delete to authenticated
  using (public.can_access_tenant_entity('proposal', proposal_id));
