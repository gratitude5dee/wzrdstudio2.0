
UPDATE public.user_credits
SET total_credits = total_credits + 1000, updated_at = now()
WHERE user_id = '549baf69-e7ca-4e37-8c72-bf2fc938a510';

INSERT INTO public.credit_transactions (user_id, amount, transaction_type, resource_type, metadata)
VALUES ('549baf69-e7ca-4e37-8c72-bf2fc938a510', 1000, 'manual_topup', 'credit', '{"description": "Manual top-up by developer"}'::jsonb);
