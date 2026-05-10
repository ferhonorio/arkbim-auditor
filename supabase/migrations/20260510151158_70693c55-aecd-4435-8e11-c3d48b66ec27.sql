-- Mover a lógica elevada do compartilhamento público para schema privado
-- e deixar a função pública como wrapper SECURITY INVOKER.

GRANT USAGE ON SCHEMA app_private TO anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.get_share_payload(_token text, _user_agent text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  BEGIN
    INSERT INTO public.share_link_access_logs (link_id, user_agent)
    VALUES (link.id, NULLIF(left(coalesce(_user_agent, ''), 500), ''));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  SELECT project_name INTO proj FROM public.app_settings LIMIT 1;

  IF link.scope = 'category' THEN
    SELECT jsonb_build_object(
      'ok', true,
      'scope', 'category',
      'project_name', proj,
      'lists', jsonb_build_array(
        jsonb_build_object(
          'id', cl.id,
          'name', cl.name,
          'data', cl.data,
          'updated_at', cl.updated_at
        )
      )
    ) INTO payload
    FROM public.component_lists cl
    WHERE cl.id = link.list_id;
  ELSE
    SELECT jsonb_build_object(
      'ok', true,
      'scope', 'all',
      'project_name', proj,
      'lists', coalesce(jsonb_agg(jsonb_build_object(
        'id', cl.id,
        'name', cl.name,
        'data', cl.data,
        'updated_at', cl.updated_at
      ) ORDER BY cl.name), '[]'::jsonb)
    ) INTO payload
    FROM public.component_lists cl;
  END IF;

  RETURN coalesce(payload, jsonb_build_object('ok', false, 'reason', 'empty'));
END $$;

REVOKE ALL ON FUNCTION app_private.get_share_payload(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.get_share_payload(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_share_payload(_token text, _user_agent text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'app_private'
AS $$
  SELECT app_private.get_share_payload(_token, _user_agent)
$$;

CREATE OR REPLACE FUNCTION public.get_share_payload(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'app_private'
AS $$
  SELECT app_private.get_share_payload(_token, NULL::text)
$$;

GRANT EXECUTE ON FUNCTION public.get_share_payload(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_share_payload(text) TO anon, authenticated;