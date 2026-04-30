DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_credits();

INSERT INTO public.user_credits (user_id, total_credits)
SELECT u.id, 0
FROM auth.users u
LEFT JOIN public.user_credits c ON c.user_id = u.id
WHERE c.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';