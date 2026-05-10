
-- 1. Migrar status 'rejected' -> 'blocked'
UPDATE public.profiles SET status = 'blocked' WHERE status = 'rejected';

-- 2. Trigger validar status (pending|approved|blocked)
CREATE OR REPLACE FUNCTION public.tg_validate_profile_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('pending','approved','blocked') THEN
    RAISE EXCEPTION 'invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END $$;

-- 3. Bootstrap do master + auto-aprovação para fer.contato@gmail.com
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  user_count int;
  is_bootstrap boolean := false;
BEGIN
  SELECT count(*) INTO user_count FROM public.profiles;

  IF lower(new.email) = 'fer.contato@gmail.com' OR user_count = 0 THEN
    is_bootstrap := true;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, status)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name',
             new.raw_user_meta_data->>'full_name',
             split_part(new.email,'@',1)),
    CASE WHEN is_bootstrap THEN 'approved' ELSE 'pending' END
  )
  ON CONFLICT (id) DO UPDATE
    SET status = CASE WHEN is_bootstrap THEN 'approved' ELSE public.profiles.status END;

  IF is_bootstrap THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'master')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN new;
END $$;

-- Idempotente: garantir master para fer.contato@gmail.com caso já exista
DO $$
DECLARE _id uuid;
BEGIN
  SELECT id INTO _id FROM auth.users WHERE lower(email) = 'fer.contato@gmail.com' LIMIT 1;
  IF _id IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, status, display_name)
    VALUES (_id, 'fer.contato@gmail.com', 'approved', 'Fernando')
    ON CONFLICT (id) DO UPDATE SET status = 'approved';
    INSERT INTO public.user_roles (user_id, role) VALUES (_id, 'master')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 4. activity_logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_logs_select_master ON public.activity_logs;
CREATE POLICY activity_logs_select_master ON public.activity_logs
  FOR SELECT TO authenticated USING (public.is_master(auth.uid()));

DROP POLICY IF EXISTS activity_logs_insert_self ON public.activity_logs;
CREATE POLICY activity_logs_insert_self ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved(auth.uid()) AND user_id = auth.uid());

CREATE INDEX IF NOT EXISTS activity_logs_user_idx ON public.activity_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_entity_idx ON public.activity_logs(entity_type, entity_id);

-- 5. share_link_access_logs (mínimo: link, user-agent, horário)
CREATE TABLE IF NOT EXISTS public.share_link_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.public_share_links(id) ON DELETE CASCADE,
  user_agent text,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.share_link_access_logs ENABLE ROW LEVEL SECURITY;

-- Apenas master ou o criador do link podem ler
DROP POLICY IF EXISTS share_access_select_owner_or_master ON public.share_link_access_logs;
CREATE POLICY share_access_select_owner_or_master ON public.share_link_access_logs
  FOR SELECT TO authenticated USING (
    public.is_master(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.public_share_links l
      WHERE l.id = share_link_access_logs.link_id
        AND l.created_by = auth.uid()
    )
  );

-- Sem políticas de INSERT/UPDATE/DELETE para clientes:
-- gravação acontece exclusivamente via SECURITY DEFINER (get_share_payload).

CREATE INDEX IF NOT EXISTS share_access_link_idx
  ON public.share_link_access_logs(link_id, accessed_at DESC);

-- 6. get_share_payload com user_agent + log
CREATE OR REPLACE FUNCTION public.get_share_payload(_token text, _user_agent text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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

  -- Registrar acesso (somente quando link é válido)
  BEGIN
    INSERT INTO public.share_link_access_logs (link_id, user_agent)
    VALUES (link.id, NULLIF(left(_user_agent, 500), ''));
  EXCEPTION WHEN OTHERS THEN
    NULL; -- nunca falhar por causa de logging
  END;

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
END $$;

-- Permissões: anon/authenticated continuam podendo invocar (auto-autorização por token)
GRANT EXECUTE ON FUNCTION public.get_share_payload(text, text) TO anon, authenticated;

-- Rollback (referência):
-- DROP TABLE public.activity_logs;
-- DROP TABLE public.share_link_access_logs;
-- restaurar handle_new_user/tg_validate_profile_status anteriores; reverter status='blocked'->'rejected'.
