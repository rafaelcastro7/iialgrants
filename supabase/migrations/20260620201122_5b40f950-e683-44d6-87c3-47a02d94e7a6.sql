
REVOKE EXECUTE ON FUNCTION public.auto_promote_stale_candidates() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_promote_stale_candidates() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auto_promote_stale_candidates() TO service_role;
