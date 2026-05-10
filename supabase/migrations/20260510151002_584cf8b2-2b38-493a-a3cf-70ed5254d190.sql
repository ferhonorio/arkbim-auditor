-- Helpers internos de RLS em schema privado, fora da API pública.
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION app_private.is_approved(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND status = 'approved')
$$;

CREATE OR REPLACE FUNCTION app_private.is_master(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _uid
      AND ur.role = 'master'
      AND p.status = 'approved'
  )
$$;

CREATE OR REPLACE FUNCTION app_private.can_edit_lists(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _uid
      AND ur.role IN ('master','coordenador')
      AND p.status = 'approved'
  )
$$;

CREATE OR REPLACE FUNCTION app_private.can_comment(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _uid
      AND ur.role IN ('master','coordenador','comentador')
      AND p.status = 'approved'
  )
$$;

REVOKE ALL ON FUNCTION app_private.is_approved(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_master(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_edit_lists(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_comment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_approved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_master(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_edit_lists(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_comment(uuid) TO authenticated;

-- Voltar os helpers públicos a não executáveis diretamente pela API.
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_master(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_edit_lists(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_comment(uuid) FROM anon, authenticated, PUBLIC;

-- Atualizar policies para os helpers privados.
DROP POLICY IF EXISTS activity_logs_select_master ON public.activity_logs;
CREATE POLICY activity_logs_select_master ON public.activity_logs
  FOR SELECT TO authenticated
  USING (app_private.is_master(auth.uid()));

DROP POLICY IF EXISTS activity_logs_insert_self ON public.activity_logs;
CREATE POLICY activity_logs_insert_self ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (app_private.is_approved(auth.uid()) AND user_id = auth.uid());

DROP POLICY IF EXISTS app_settings_select_approved ON public.app_settings;
CREATE POLICY app_settings_select_approved ON public.app_settings
  FOR SELECT TO authenticated
  USING (app_private.is_approved(auth.uid()));

DROP POLICY IF EXISTS app_settings_insert_master ON public.app_settings;
CREATE POLICY app_settings_insert_master ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (app_private.is_master(auth.uid()));

DROP POLICY IF EXISTS app_settings_update_master ON public.app_settings;
CREATE POLICY app_settings_update_master ON public.app_settings
  FOR UPDATE TO authenticated
  USING (app_private.is_master(auth.uid()))
  WITH CHECK (app_private.is_master(auth.uid()));

DROP POLICY IF EXISTS lists_select_approved ON public.component_lists;
CREATE POLICY lists_select_approved ON public.component_lists
  FOR SELECT TO authenticated
  USING (app_private.is_approved(auth.uid()));

DROP POLICY IF EXISTS lists_insert_editor ON public.component_lists;
CREATE POLICY lists_insert_editor ON public.component_lists
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_edit_lists(auth.uid()) AND auth.uid() = user_id);

DROP POLICY IF EXISTS lists_update_owner_or_master ON public.component_lists;
CREATE POLICY lists_update_owner_or_master ON public.component_lists
  FOR UPDATE TO authenticated
  USING (app_private.is_master(auth.uid()) OR (app_private.can_edit_lists(auth.uid()) AND auth.uid() = user_id))
  WITH CHECK (app_private.is_master(auth.uid()) OR (app_private.can_edit_lists(auth.uid()) AND auth.uid() = user_id));

DROP POLICY IF EXISTS lists_delete_owner_or_master ON public.component_lists;
CREATE POLICY lists_delete_owner_or_master ON public.component_lists
  FOR DELETE TO authenticated
  USING (app_private.is_master(auth.uid()) OR (app_private.can_edit_lists(auth.uid()) AND auth.uid() = user_id));

DROP POLICY IF EXISTS item_comments_select ON public.item_comments;
CREATE POLICY item_comments_select ON public.item_comments
  FOR SELECT TO authenticated
  USING (app_private.is_approved(auth.uid()) AND (app_private.can_edit_lists(auth.uid()) OR (resolved_at IS NULL AND expires_at > now())));

DROP POLICY IF EXISTS item_comments_insert ON public.item_comments;
CREATE POLICY item_comments_insert ON public.item_comments
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_comment(auth.uid()) AND user_id = auth.uid());

DROP POLICY IF EXISTS item_comments_delete ON public.item_comments;
CREATE POLICY item_comments_delete ON public.item_comments
  FOR DELETE TO authenticated
  USING (app_private.is_approved(auth.uid()) AND ((user_id = auth.uid()) OR app_private.can_edit_lists(auth.uid())));

DROP POLICY IF EXISTS item_comments_update ON public.item_comments;
CREATE POLICY item_comments_update ON public.item_comments
  FOR UPDATE TO authenticated
  USING (app_private.is_approved(auth.uid()) AND ((user_id = auth.uid()) OR app_private.can_edit_lists(auth.uid())))
  WITH CHECK (app_private.is_approved(auth.uid()) AND ((user_id = auth.uid()) OR app_private.can_edit_lists(auth.uid())));

DROP POLICY IF EXISTS profiles_select_own_or_master ON public.profiles;
CREATE POLICY profiles_select_own_or_master ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR app_private.is_master(auth.uid()));

DROP POLICY IF EXISTS profiles_update_own_or_master ON public.profiles;
CREATE POLICY profiles_update_own_or_master ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR app_private.is_master(auth.uid()))
  WITH CHECK (auth.uid() = id OR app_private.is_master(auth.uid()));

DROP POLICY IF EXISTS share_links_select_editor ON public.public_share_links;
CREATE POLICY share_links_select_editor ON public.public_share_links
  FOR SELECT TO authenticated
  USING (app_private.can_edit_lists(auth.uid()));

DROP POLICY IF EXISTS share_links_insert_editor ON public.public_share_links;
CREATE POLICY share_links_insert_editor ON public.public_share_links
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_edit_lists(auth.uid()) AND created_by = auth.uid());

DROP POLICY IF EXISTS share_links_update_owner_or_master ON public.public_share_links;
CREATE POLICY share_links_update_owner_or_master ON public.public_share_links
  FOR UPDATE TO authenticated
  USING (app_private.is_master(auth.uid()) OR (app_private.can_edit_lists(auth.uid()) AND created_by = auth.uid()))
  WITH CHECK (app_private.is_master(auth.uid()) OR (app_private.can_edit_lists(auth.uid()) AND created_by = auth.uid()));

DROP POLICY IF EXISTS share_links_delete_owner_or_master ON public.public_share_links;
CREATE POLICY share_links_delete_owner_or_master ON public.public_share_links
  FOR DELETE TO authenticated
  USING (app_private.is_master(auth.uid()) OR (app_private.can_edit_lists(auth.uid()) AND created_by = auth.uid()));

DROP POLICY IF EXISTS share_access_select_owner_or_master ON public.share_link_access_logs;
CREATE POLICY share_access_select_owner_or_master ON public.share_link_access_logs
  FOR SELECT TO authenticated
  USING (
    app_private.is_master(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.public_share_links l
      WHERE l.id = share_link_access_logs.link_id AND l.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS user_roles_select_own_or_master ON public.user_roles;
CREATE POLICY user_roles_select_own_or_master ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR app_private.is_master(auth.uid()));

DROP POLICY IF EXISTS user_roles_insert_master ON public.user_roles;
CREATE POLICY user_roles_insert_master ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (app_private.is_master(auth.uid()));

DROP POLICY IF EXISTS user_roles_update_master ON public.user_roles;
CREATE POLICY user_roles_update_master ON public.user_roles
  FOR UPDATE TO authenticated
  USING (app_private.is_master(auth.uid()))
  WITH CHECK (app_private.is_master(auth.uid()));

DROP POLICY IF EXISTS user_roles_delete_master ON public.user_roles;
CREATE POLICY user_roles_delete_master ON public.user_roles
  FOR DELETE TO authenticated
  USING (app_private.is_master(auth.uid()));

-- Reafirmar bootstrap master.
DO $$
DECLARE
  _id uuid;
BEGIN
  SELECT id INTO _id FROM public.profiles WHERE lower(email) = 'fer.contato@gmail.com' LIMIT 1;

  IF _id IS NOT NULL THEN
    UPDATE public.profiles SET status = 'approved' WHERE id = _id;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_id, 'master')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;