-- Corrigir permissões das funções usadas pelas policies RLS.
-- Elas precisam ser executáveis pelo papel authenticated para que o próprio RLS consiga avaliá-las.
-- Mantemos anon sem acesso a essas funções internas.

GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_master(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_lists(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_comment(uuid) TO authenticated;

-- Garantir que o usuário bootstrap continue aprovado como master, caso a migração anterior
-- tenha sido aplicada antes da conta existir ou a sessão esteja lendo um estado antigo.
DO $$
DECLARE
  _id uuid;
BEGIN
  SELECT id INTO _id FROM public.profiles WHERE lower(email) = 'fer.contato@gmail.com' LIMIT 1;

  IF _id IS NOT NULL THEN
    UPDATE public.profiles
       SET status = 'approved'
     WHERE id = _id;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (_id, 'master')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;