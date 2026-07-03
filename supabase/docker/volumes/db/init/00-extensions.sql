-- Extensions required by IIAL Grants

-- Create extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;

-- Core extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgjwt" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "vector" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_trgm" SCHEMA extensions;

-- pg_cron (shared_preload_libraries set via docker-compose command)
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Roles + search_path in one atomic block
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;

  -- Set search_path so migrations find extensions functions (gen_random_bytes, digest, etc.)
  EXECUTE 'ALTER ROLE postgres SET search_path TO public, extensions';
  EXECUTE 'ALTER ROLE anon SET search_path TO public, extensions';
  EXECUTE 'ALTER ROLE authenticated SET search_path TO public, extensions';
  EXECUTE 'ALTER ROLE service_role SET search_path TO public, extensions';
END
$$;

-- Schema permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO service_role;

-- Default grants
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- Auth schema (created by GoTrue, but ensure it exists)
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON SEQUENCES TO service_role;

-- Cron schema permissions
DO $$ BEGIN
  GRANT USAGE ON SCHEMA cron TO anon, authenticated, service_role;
  GRANT ALL ON SCHEMA cron TO service_role;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
