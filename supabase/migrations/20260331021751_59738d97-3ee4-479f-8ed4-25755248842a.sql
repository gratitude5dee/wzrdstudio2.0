-- Add 100 credits to all existing users
UPDATE public.user_credits
SET total_credits = total_credits + 100,
    updated_at = now();

-- Record transactions for audit trail
INSERT INTO public.credit_transactions (user_id, amount, transaction_type, resource_type, metadata)
SELECT user_id, 100, 'free', 'credit', '{"description": "Bonus 100 credits grant"}'::jsonb
FROM public.user_credits;