import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { routeToBillingTopUp } from '@/lib/billing-errors';
import { isDevAuthBypassEnabled } from '@/lib/devAuthBypass';
import type { Json } from '@/integrations/supabase/types';

export interface CreditTransaction {
  id: string;
  amount: number;
  transaction_type: 'usage' | 'purchase' | 'refund' | 'free';
  resource_type: 'image' | 'video' | 'text' | 'credit';
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface CreditWalletSummary {
  user_id: string;
  plan_code: string;
  monthly_quota: number;
  monthly_remaining: number;
  rollover_remaining: number;
  topup_remaining: number;
  available_total: number;
  reset_at: string;
  updated_at: string;
}

export interface CreditPlanSummary {
  plan_code: string;
  display_name: string;
  monthly_price_cents: number;
  yearly_price_cents: number | null;
  monthly_quota: number;
  rollover_cap: number;
  description: string | null;
}

const mapTransactionType = (entryType: string): CreditTransaction['transaction_type'] => {
  if (entryType === 'usage' || entryType === 'purchase' || entryType === 'refund' || entryType === 'free') {
    return entryType;
  }
  if (entryType === 'grant') return 'purchase';
  if (entryType === 'release') return 'refund';
  if (entryType === 'adjustment') return 'free';
  return 'usage';
};

const mapResourceType = (resourceType: string): CreditTransaction['resource_type'] => {
  if (resourceType === 'video' || resourceType === 'text' || resourceType === 'credit') return resourceType;
  if (resourceType === 'image') return 'image';
  return 'credit';
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const asString = (value: unknown, fallback = ''): string => (
  typeof value === 'string' && value.length > 0 ? value : fallback
);

const mapBalancePayload = (data: Json): {
  wallet: CreditWalletSummary | null;
  plan: CreditPlanSummary | null;
  availableCredits: number;
} => {
  const payload = asRecord(data);
  const walletRaw = asRecord(payload.wallet);
  const planRaw = asRecord(payload.plan);
  const wallet = Object.keys(walletRaw).length > 0 ? {
    user_id: asString(walletRaw.user_id),
    plan_code: asString(walletRaw.plan_code, 'free'),
    monthly_quota: asNumber(walletRaw.monthly_quota),
    monthly_remaining: asNumber(walletRaw.monthly_remaining),
    rollover_remaining: asNumber(walletRaw.rollover_remaining),
    topup_remaining: asNumber(walletRaw.topup_remaining),
    available_total: asNumber(walletRaw.available_total),
    reset_at: asString(walletRaw.reset_at),
    updated_at: asString(walletRaw.updated_at),
  } satisfies CreditWalletSummary : null;

  const plan = Object.keys(planRaw).length > 0 ? {
    plan_code: asString(planRaw.plan_code, 'free'),
    display_name: asString(planRaw.display_name, 'Free'),
    monthly_price_cents: asNumber(planRaw.monthly_price_cents),
    yearly_price_cents: planRaw.yearly_price_cents === null ? null : asNumber(planRaw.yearly_price_cents),
    monthly_quota: asNumber(planRaw.monthly_quota),
    rollover_cap: asNumber(planRaw.rollover_cap),
    description: typeof planRaw.description === 'string' ? planRaw.description : null,
  } satisfies CreditPlanSummary : null;

  return {
    wallet,
    plan,
    availableCredits: wallet?.available_total ?? 0,
  };
};

export const useCredits = () => {
  const [availableCredits, setAvailableCredits] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [wallet, setWallet] = useState<CreditWalletSummary | null>(null);
  const [plan, setPlan] = useState<CreditPlanSummary | null>(null);
  const { user } = useAuth();

  const fetchCredits = async () => {
    if (isDevAuthBypassEnabled()) {
      setAvailableCredits(0);
      setWallet(null);
      setPlan(null);
      setIsLoading(false);
      return;
    }

    if (!user) {
      setAvailableCredits(null);
      setWallet(null);
      setPlan(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      let { data, error } = await supabase.rpc('credits_get_balance');
      if (error) {
        const repair = await supabase.rpc('ensure_credit_account', {
          p_user_id: user.id,
          p_source: 'client_fetch_repair',
        });
        if (repair.error) throw repair.error;
        const retry = await supabase.rpc('credits_get_balance');
        data = retry.data;
        error = retry.error;
      }
      if (error) throw error;

      const mapped = mapBalancePayload(data);
      setAvailableCredits(mapped.availableCredits);
      setWallet(mapped.wallet);
      setPlan(mapped.plan);
    } catch (error) {
      console.error('Error fetching credits:', error);
      setAvailableCredits(0);
      setWallet(null);
      setPlan(null);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTransactions = async () => {
    if (isDevAuthBypassEnabled()) {
      setTransactions([]);
      return;
    }

    if (!user) {
      setTransactions([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('id, transaction_type, resource_type, amount, created_at, metadata')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      const mapped: CreditTransaction[] = (Array.isArray(data) ? data : []).map((entry) => ({
        id: entry.id,
        amount: Math.ceil(Number(entry.amount) || 0),
        transaction_type: mapTransactionType(String(entry.transaction_type || 'usage')),
        resource_type: mapResourceType(String(entry.resource_type || 'credit')),
        created_at: entry.created_at,
        metadata: asRecord(entry.metadata),
      }));

      setTransactions(mapped);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setTransactions([]);
    }
  };

  const useCreditsForResource = async (
    resourceType: 'image' | 'video' | 'text',
    creditCost = 1,
    metadata: Record<string, unknown> = {},
  ) => {
    if (!user) {
      toast.error('Please log in to use this feature');
      return false;
    }

    try {
      const { data, error } = await supabase.rpc('use_credits', {
        resource_type: resourceType,
        credit_cost: creditCost,
        metadata: metadata as unknown as Json,
      });

      if (error) throw error;

      if (!data) {
        routeToBillingTopUp({ code: 'insufficient_credits', required: creditCost, available: availableCredits ?? 0, top_up_url: '/settings/billing' });
        return false;
      }

      fetchCredits();
      fetchTransactions();
      return true;
    } catch (error) {
      console.error('Error using credits:', error);
      toast.error('Failed to reserve credits');
      return false;
    }
  };

  const addCredits = async (
    amount: number,
    transactionType: 'purchase' | 'free' = 'purchase',
    metadata: Record<string, unknown> = {},
  ) => {
    if (!user) {
      toast.error('Please log in to add credits');
      return false;
    }

    void amount;
    void transactionType;
    void metadata;
    routeToBillingTopUp({ code: 'insufficient_credits', required: 1, available: availableCredits ?? 0, top_up_url: '/settings/billing' });
    return false;
  };

  useEffect(() => {
    fetchCredits();
    fetchTransactions();
  }, [user]);

  return {
    availableCredits,
    isLoading,
    transactions,
    wallet,
    plan,
    useCredits: useCreditsForResource,
    addCredits,
    refreshCredits: fetchCredits,
    refreshTransactions: fetchTransactions,
  };
};
