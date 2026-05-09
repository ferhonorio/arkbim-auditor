
-- 1. Status na profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- Validação via trigger (não check, para flexibilidade)
CREATE OR REPLACE FUNCTION public.tg_validate_profile_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.tg_validate_profile_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_profile_status ON public.profiles;
CREATE TRIGGER validate_profile_status
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_validate_profile_status();

-- 2. Atualiza handle_new_user: primeiro usuário = master aprovado; demais = pending sem role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count int;
BEGIN
  SELECT count(*) INTO user_count FROM public.profiles;

  IF user_count = 0 THEN
    INSERT INTO public.profiles (id, email, display_name, status)
    VALUES (new.id, new.email,
      coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
      'approved');
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'master');
  ELSE
    INSERT INTO public.profiles (id, email, display_name, status)
    VALUES (new.id, new.email,
      coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
      'pending');
  END IF;
  RETURN new;
END $$;

-- Garantir trigger existe em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Funções de permissão (security definer, restringidas a authenticated)
CREATE OR REPLACE FUNCTION public.is_master(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'master')
$$;

CREATE OR REPLACE FUNCTION public.can_edit_lists(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role IN ('master','coordenador')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_comment(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role IN ('master','coordenador','comentador')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_approved(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND status = 'approved')
$$;

REVOKE EXECUTE ON FUNCTION public.is_master(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_lists(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_comment(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_master(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_lists(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_comment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;

-- 4. RLS component_lists — substituir policies
DROP POLICY IF EXISTS lists_select_own_or_admin ON public.component_lists;
DROP POLICY IF EXISTS lists_insert_own ON public.component_lists;
DROP POLICY IF EXISTS lists_update_own ON public.component_lists;
DROP POLICY IF EXISTS lists_delete_own ON public.component_lists;

-- SELECT: qualquer usuário aprovado vê todas as listas
CREATE POLICY lists_select_approved ON public.component_lists
FOR SELECT TO authenticated
USING (public.is_approved(auth.uid()));

-- INSERT: apenas master/coordenador, sempre como dono
CREATE POLICY lists_insert_editor ON public.component_lists
FOR INSERT TO authenticated
WITH CHECK (public.can_edit_lists(auth.uid()) AND auth.uid() = user_id);

-- UPDATE: master/coordenador podem editar qualquer lista
CREATE POLICY lists_update_editor ON public.component_lists
FOR UPDATE TO authenticated
USING (public.can_edit_lists(auth.uid()));

-- DELETE: apenas master ou dono coordenador
CREATE POLICY lists_delete_editor ON public.component_lists
FOR DELETE TO authenticated
USING (public.can_edit_lists(auth.uid()));

-- 5. profiles — master vê e edita todos
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own_or_master ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = id OR public.is_master(auth.uid()));

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own_or_master ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id OR public.is_master(auth.uid()));

-- 6. user_roles — master gerencia, todos veem o próprio
DROP POLICY IF EXISTS user_roles_select_own_or_admin ON public.user_roles;
CREATE POLICY user_roles_select_own_or_master ON public.user_roles
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_master(auth.uid()));

CREATE POLICY user_roles_insert_master ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (public.is_master(auth.uid()));

CREATE POLICY user_roles_update_master ON public.user_roles
FOR UPDATE TO authenticated
USING (public.is_master(auth.uid()));

CREATE POLICY user_roles_delete_master ON public.user_roles
FOR DELETE TO authenticated
USING (public.is_master(auth.uid()));

-- 7. Promover primeiro usuário existente (se houver) a master se ainda não houver master
DO $$
DECLARE first_uid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'master') THEN
    SELECT id INTO first_uid FROM public.profiles ORDER BY created_at ASC LIMIT 1;
    IF first_uid IS NOT NULL THEN
      DELETE FROM public.user_roles WHERE user_id = first_uid;
      INSERT INTO public.user_roles (user_id, role) VALUES (first_uid, 'master');
      UPDATE public.profiles SET status = 'approved' WHERE id = first_uid;
    END IF;
  END IF;
END $$;
