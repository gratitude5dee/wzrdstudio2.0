
-- Grant 100 free credits to new users when their profile is created
CREATE OR REPLACE FUNCTION public.grant_free_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, total_credits)
  VALUES (NEW.id, 100)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.credit_transactions (user_id, amount, transaction_type, resource_type, metadata)
  VALUES (NEW.id, 100, 'free', 'credit', '{"description": "Welcome bonus - Free plan"}'::jsonb);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS on_profile_created_grant_credits ON public.profiles;
CREATE TRIGGER on_profile_created_grant_credits
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_free_credits();
