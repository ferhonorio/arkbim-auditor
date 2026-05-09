
-- 1) Convert any 'visualizador' role rows to 'comentador'
UPDATE public.user_roles SET role = 'comentador' WHERE role = 'visualizador';

-- 2) Profiles: add user_label + must_change_password
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_label text,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- 3) public_share_links table
CREATE TABLE IF NOT EXISTS public.public_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  list_id uuid NULL,
  scope text NOT NULL DEFAULT 'all',
  expires_at timestamptz NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.tg_validate_share_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.scope NOT IN ('all','category') THEN
    RAISE EXCEPTION 'invalid scope: %', NEW.scope;
  END IF;
  IF NEW.scope = 'category' AND NEW.list_id IS NULL THEN
    RAISE EXCEPTION 'list_id required when scope=category';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS share_links_validate ON public.public_share_links;
CREATE TRIGGER share_links_validate
  BEFORE INSERT OR UPDATE ON public.public_share_links
  FOR EACH ROW EXECUTE FUNCTION public.tg_validate_share_scope();

ALTER TABLE public.public_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS share_links_select_editor ON public.public_share_links;
CREATE POLICY share_links_select_editor ON public.public_share_links
  FOR SELECT TO authenticated
  USING (public.can_edit_lists(auth.uid()));

DROP POLICY IF EXISTS share_links_insert_editor ON public.public_share_links;
CREATE POLICY share_links_insert_editor ON public.public_share_links
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_lists(auth.uid()) AND created_by = auth.uid());

DROP POLICY IF EXISTS share_links_update_editor ON public.public_share_links;
CREATE POLICY share_links_update_editor ON public.public_share_links
  FOR UPDATE TO authenticated
  USING (public.can_edit_lists(auth.uid()))
  WITH CHECK (public.can_edit_lists(auth.uid()));

DROP POLICY IF EXISTS share_links_delete_editor ON public.public_share_links;
CREATE POLICY share_links_delete_editor ON public.public_share_links
  FOR DELETE TO authenticated
  USING (public.can_edit_lists(auth.uid()));

-- 4) item_comments table
CREATE TABLE IF NOT EXISTS public.item_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL,
  item_key text NOT NULL,
  user_id uuid NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 days'),
  resolved_at timestamptz NULL,
  resolved_by uuid NULL
);

CREATE INDEX IF NOT EXISTS idx_item_comments_list_item ON public.item_comments(list_id, item_key);

ALTER TABLE public.item_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_comments_select ON public.item_comments;
CREATE POLICY item_comments_select ON public.item_comments
  FOR SELECT TO authenticated
  USING (
    public.is_approved(auth.uid())
    AND (
      public.can_edit_lists(auth.uid())
      OR (resolved_at IS NULL AND expires_at > now())
    )
  );

DROP POLICY IF EXISTS item_comments_insert ON public.item_comments;
CREATE POLICY item_comments_insert ON public.item_comments
  FOR INSERT TO authenticated
  WITH CHECK (public.can_comment(auth.uid()) AND user_id = auth.uid());

DROP POLICY IF EXISTS item_comments_update ON public.item_comments;
CREATE POLICY item_comments_update ON public.item_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.can_edit_lists(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.can_edit_lists(auth.uid()));

DROP POLICY IF EXISTS item_comments_delete ON public.item_comments;
CREATE POLICY item_comments_delete ON public.item_comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.can_edit_lists(auth.uid()));

-- 5) Restrict component_lists DELETE to master only
DROP POLICY IF EXISTS lists_delete_owner_or_master ON public.component_lists;
CREATE POLICY lists_delete_master_only ON public.component_lists
  FOR DELETE TO authenticated
  USING (public.is_master(auth.uid()));

-- 6) Public RPC to fetch shared payload by token (no auth required)
CREATE OR REPLACE FUNCTION public.get_share_payload(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link record;
  payload jsonb;
BEGIN
  SELECT * INTO link FROM public.public_share_links
  WHERE token = _token AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF link.expires_at IS NOT NULL AND link.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF link.scope = 'category' THEN
    SELECT jsonb_build_object(
      'ok', true,
      'scope', 'category',
      'lists', jsonb_build_array(
        jsonb_build_object('id', cl.id, 'name', cl.name, 'data', cl.data, 'updated_at', cl.updated_at)
      )
    ) INTO payload
    FROM public.component_lists cl WHERE cl.id = link.list_id;
  ELSE
    SELECT jsonb_build_object(
      'ok', true,
      'scope', 'all',
      'lists', coalesce(jsonb_agg(jsonb_build_object(
        'id', cl.id, 'name', cl.name, 'data', cl.data, 'updated_at', cl.updated_at
      ) ORDER BY cl.name), '[]'::jsonb)
    ) INTO payload
    FROM public.component_lists cl;
  END IF;

  RETURN coalesce(payload, jsonb_build_object('ok', false, 'reason', 'empty'));
END $$;

GRANT EXECUTE ON FUNCTION public.get_share_payload(text) TO anon, authenticated;
