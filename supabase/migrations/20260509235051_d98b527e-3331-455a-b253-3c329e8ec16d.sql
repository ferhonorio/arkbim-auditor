-- App settings (singleton row)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_settings_select_approved
  ON public.app_settings FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY app_settings_insert_master
  ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_master(auth.uid()));

CREATE POLICY app_settings_update_master
  ON public.app_settings FOR UPDATE TO authenticated
  USING (public.is_master(auth.uid()))
  WITH CHECK (public.is_master(auth.uid()));

-- Seed singleton row
INSERT INTO public.app_settings (project_name) VALUES (NULL)
ON CONFLICT DO NOTHING;

-- Update share payload to include project_name
CREATE OR REPLACE FUNCTION public.get_share_payload(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  link record;
  payload jsonb;
  proj text;
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

  SELECT project_name INTO proj FROM public.app_settings LIMIT 1;

  IF link.scope = 'category' THEN
    SELECT jsonb_build_object(
      'ok', true,
      'scope', 'category',
      'project_name', proj,
      'lists', jsonb_build_array(
        jsonb_build_object('id', cl.id, 'name', cl.name, 'data', cl.data, 'updated_at', cl.updated_at)
      )
    ) INTO payload
    FROM public.component_lists cl WHERE cl.id = link.list_id;
  ELSE
    SELECT jsonb_build_object(
      'ok', true,
      'scope', 'all',
      'project_name', proj,
      'lists', coalesce(jsonb_agg(jsonb_build_object(
        'id', cl.id, 'name', cl.name, 'data', cl.data, 'updated_at', cl.updated_at
      ) ORDER BY cl.name), '[]'::jsonb)
    ) INTO payload
    FROM public.component_lists cl;
  END IF;

  RETURN coalesce(payload, jsonb_build_object('ok', false, 'reason', 'empty'));
END $function$;