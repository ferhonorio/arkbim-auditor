
-- 1. Strengthen can_edit_lists and can_comment to require approved profile.
CREATE OR REPLACE FUNCTION public.can_edit_lists(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _uid
      AND ur.role IN ('master','coordenador')
      AND p.status = 'approved'
  )
$$;

CREATE OR REPLACE FUNCTION public.can_comment(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _uid
      AND ur.role IN ('master','coordenador','comentador')
      AND p.status = 'approved'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_master(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _uid AND ur.role = 'master' AND p.status = 'approved'
  )
$$;

-- 2. item_comments: also require approved (defense in depth via the helper above already does it,
-- but make it explicit for delete/update).
DROP POLICY IF EXISTS item_comments_delete ON public.item_comments;
CREATE POLICY item_comments_delete ON public.item_comments
  FOR DELETE TO authenticated
  USING (is_approved(auth.uid()) AND ((user_id = auth.uid()) OR can_edit_lists(auth.uid())));

DROP POLICY IF EXISTS item_comments_update ON public.item_comments;
CREATE POLICY item_comments_update ON public.item_comments
  FOR UPDATE TO authenticated
  USING (is_approved(auth.uid()) AND ((user_id = auth.uid()) OR can_edit_lists(auth.uid())))
  WITH CHECK (is_approved(auth.uid()) AND ((user_id = auth.uid()) OR can_edit_lists(auth.uid())));

-- 3. component_lists: allow coordenador to delete OWN lists; masters can delete any.
DROP POLICY IF EXISTS lists_delete_master_only ON public.component_lists;
CREATE POLICY lists_delete_owner_or_master ON public.component_lists
  FOR DELETE TO authenticated
  USING (is_master(auth.uid()) OR (can_edit_lists(auth.uid()) AND auth.uid() = user_id));

-- 4. public_share_links: restrict update/delete to owner or master.
DROP POLICY IF EXISTS share_links_update_editor ON public.public_share_links;
CREATE POLICY share_links_update_owner_or_master ON public.public_share_links
  FOR UPDATE TO authenticated
  USING (is_master(auth.uid()) OR (can_edit_lists(auth.uid()) AND created_by = auth.uid()))
  WITH CHECK (is_master(auth.uid()) OR (can_edit_lists(auth.uid()) AND created_by = auth.uid()));

DROP POLICY IF EXISTS share_links_delete_editor ON public.public_share_links;
CREATE POLICY share_links_delete_owner_or_master ON public.public_share_links
  FOR DELETE TO authenticated
  USING (is_master(auth.uid()) OR (can_edit_lists(auth.uid()) AND created_by = auth.uid()));

-- 5. Revoke EXECUTE on internal SECURITY DEFINER helpers from anon/authenticated.
-- These are used inside RLS policies/triggers and should not be callable from PostgREST.
-- get_share_payload remains executable for public share-link consumption.
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_master(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_edit_lists(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_comment(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_validate_profile_status() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_validate_share_scope() FROM anon, authenticated, public;
