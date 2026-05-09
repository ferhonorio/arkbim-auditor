-- 1) Restrict UPDATE/DELETE on component_lists to owner (or master).
DROP POLICY IF EXISTS lists_update_editor ON public.component_lists;
DROP POLICY IF EXISTS lists_delete_editor ON public.component_lists;

CREATE POLICY lists_update_owner_or_master
ON public.component_lists
FOR UPDATE
TO authenticated
USING (
  public.is_master(auth.uid())
  OR (public.can_edit_lists(auth.uid()) AND auth.uid() = user_id)
)
WITH CHECK (
  public.is_master(auth.uid())
  OR (public.can_edit_lists(auth.uid()) AND auth.uid() = user_id)
);

CREATE POLICY lists_delete_owner_or_master
ON public.component_lists
FOR DELETE
TO authenticated
USING (
  public.is_master(auth.uid())
  OR (public.can_edit_lists(auth.uid()) AND auth.uid() = user_id)
);

-- 2) Revoke EXECUTE on internal SECURITY DEFINER helpers from clients.
-- They remain usable inside RLS policy expressions (Postgres evaluates
-- those server-side regardless of caller EXECUTE rights).
REVOKE EXECUTE ON FUNCTION public.is_master(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_edit_lists(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_comment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;