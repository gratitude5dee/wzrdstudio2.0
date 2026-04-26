import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';

export interface CreditTransaction {
  id: string;
  amount: number;
  transaction_type: 'usage' | 'purchase' | 'refund' | 'free';
  resource_type: 'image' | 'video' | 'text' | 'credit';
  created_at: string;
  metadata: Record<string, any>;
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

const mapLedgerEntryType = (entryType: string): CreditTransaction['transaction_type'] => {
  if (entryType === 'grant') return 'purchase';
  if (entryType === 'refund' || entryType === 'release') return 'refund';
  if (entryType === 'adjustment') return 'free';
  return 'usage';
};

const mapResourceType = (resourceType: string): CreditTransaction['resource_type'] => {
  if (resourceType === 'video' || resourceType === 'text' || resourceType === 'credit') return resourceType;
  if (resourceType === 'image') return 'image';
  return 'credit';
};

export const useCredits = () => {
  const [availableCredits, setAvailableCredits] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [wallet, setWallet] = useState<CreditWalletSummary | null>(null);
  const [plan, setPlan] = useState<CreditPlanSummary | null>(null);
  const { user } = useAuth();

  const fetchCredits = async () => {
    if (!user) {
      setAvailableCredits(null);
      setWallet(null);
      setPlan(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Use legacy credit system (the only one the backend actually supports)
      const { data: legacyData, error: legacyError } = await supabase.rpc('get_available_credits');
      if (legacyError) throw legacyError;
      setAvailableCredits(legacyData ?? 0);
      setWallet(null);
      setPlan(null);
    } catch (error) {
      console.error('Error fetching credits:', error);
      toast.error('Failed to load credits');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTransactions = async () => {
    if (!user) {
      setTransactions([]);
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .from('credit_transactions')
        .select('id, transaction_type, resource_type, amount, created_at, metadata')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      const mapped: CreditTransaction[] = (Array.isArray(data) ? data : []).map((entry: any) => ({
        id: entry.id,
        amount: Math.ceil(Number(entry.amount) || 0),
        transaction_type: mapLedgerEntryType(String(entry.transaction_type || 'usage')),
        resource_type: mapResourceType(String(entry.resource_type || 'credit')),
        created_at: entry.created_at,
        metadata: entry.metadata || {},
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
    metadata: Record<string, any> = {},
  ) => {
    if (!user) {
      toast.error('Please log in to use this feature');
      return false;
    }

    try {
      const { data, error } = await supabase.rpc('use_credits', {
        resource_type: resourceType,
        credit_cost: creditCost,
        metadata,
      });

      if (error) throw error;

      if (!data) {
        toast.error('Not enough credits available');
        return false;
      }

      fetchCredits();
      fetchTransactions();
      return true;
    } catch (error) {
      console.error('Error using credits:', error);
      toast.error('Failed to use credits');
      return false;
    }
  };

  const addCredits = async (
    amount: number,
    transactionType: 'purchase' | 'free' = 'purchase',
    metadata: Record<string, any> = {},
  ) => {
    if (!user) {
      toast.error('Please log in to add credits');
      return false;
    }

    try {
      const { error } = await supabase.rpc('add_credits', {
        credit_amount: amount,
        transaction_type: transactionType,
        metadata,
      });

      if (error) throw error;

      fetchCredits();
      fetchTransactions();
      toast.success(`Added ${amount} credits to your account`);
      return true;
    } catch (error) {
      console.error('Error adding credits:', error);
      toast.error('Failed to add credits');
      return false;
    }
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
