do $$
declare
  v_pw text := 'IIAL-Demo-2026!';
  v_admin uuid;
  v_mem_a uuid;
  v_mem_b uuid;
  rec record;
  v_uid uuid;
begin
  for rec in
    select * from (values
      ('demo-admin@iial.test'),
      ('demo-member-a@iial.test'),
      ('demo-member-b@iial.test')
    ) as t(email)
  loop
    -- find or create the auth user
    select id into v_uid from auth.users where email = rec.email limit 1;
    if v_uid is null then
      v_uid := gen_random_uuid();
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, confirmation_token, recovery_token,
        email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, is_super_admin
      ) values (
        v_uid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        rec.email,
        crypt(v_pw, gen_salt('bf')),
        now(),
        '', '', '', '',
        jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
        '{}'::jsonb,
        now(), now(), false
      );
    else
      update auth.users
        set encrypted_password = crypt(v_pw, gen_salt('bf')),
            email_confirmed_at = coalesce(email_confirmed_at, now()),
            updated_at = now()
        where id = v_uid;
    end if;

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(), v_uid, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', rec.email, 'email_verified', true),
      'email', now(), now(), now()
    )
    on conflict (provider_id, provider) do nothing;

    -- profile + member role (idempotent; the on-signup trigger may have already inserted them)
    insert into public.profiles (id, preferred_lang) values (v_uid, 'en') on conflict (id) do nothing;
    insert into public.user_roles (user_id, role) values (v_uid, 'member') on conflict do nothing;

    if rec.email = 'demo-admin@iial.test' then v_admin := v_uid; end if;
    if rec.email = 'demo-member-a@iial.test' then v_mem_a := v_uid; end if;
    if rec.email = 'demo-member-b@iial.test' then v_mem_b := v_uid; end if;
  end loop;

  -- admin role
  if v_admin is not null then
    insert into public.user_roles (user_id, role) values (v_admin, 'admin') on conflict do nothing;
    insert into public.org_profiles (
      user_id, org_name, sectors, jurisdictions, stage, annual_budget_cad, focus_areas
    ) values (
      v_admin, 'IIAL Demo Co.',
      array['tech','ai','clean-tech'], array['CA','ON','QC'],
      'sme', 750000, array['R&D','export','workforce-training']
    )
    on conflict (user_id) do nothing;
  end if;
end $$;