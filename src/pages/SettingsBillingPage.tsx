import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CircleDollarSign, Coins, FileText, LifeBuoy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useBilling, type BillingCreditPack, type BillingPlan } from '@/hooks/useBilling';
import { useCredits } from '@/hooks/useCredits';
import { toast } from 'sonner';
import { appRoutes } from '@/lib/routes';

const FALLBACK_PLANS: BillingPlan[] = [
  {
    plan_code: 'free',
    display_name: 'Free',
    description: 'Get started with 100 credits per month.',
    monthly_price_cents: 0,
    yearly_price_cents: null,
    monthly_quota: 100,
    rollover_cap: 0,
  },
  {
    plan_code: 'pro',
    display_name: 'Pro',
    description: 'For independent creators and small teams.',
    monthly_price_cents: 4900,
    yearly_price_cents: null,
    monthly_quota: 2000,
    rollover_cap: 2000,
  },
  {
    plan_code: 'business',
    display_name: 'Business',
    description: 'For larger teams with heavier generation volume.',
    monthly_price_cents: 14900,
    yearly_price_cents: null,
    monthly_quota: 10000,
    rollover_cap: 10000,
  },
  {
    plan_code: 'enterprise',
    display_name: 'Enterprise',
    description: 'Custom billing, governance, and support.',
    monthly_price_cents: 0,
    yearly_price_cents: null,
    monthly_quota: 0,
    rollover_cap: 0,
  },
];

const FALLBACK_PACKS: BillingCreditPack[] = [
  { pack_code: 'pack_50', display_name: '+50 credits', credits: 50, price_cents: 500 },
  { pack_code: 'pack_100', display_name: '+100 credits', credits: 100, price_cents: 1000 },
  { pack_code: 'pack_150', display_name: '+150 credits', credits: 150, price_cents: 1500 },
  { pack_code: 'pack_200', display_name: '+200 credits', credits: 200, price_cents: 2000 },
  { pack_code: 'pack_250', display_name: '+250 credits', credits: 250, price_cents: 2500 },
  { pack_code: 'pack_300', display_name: '+300 credits', credits: 300, price_cents: 3000 },
  { pack_code: 'pack_350', display_name: '+350 credits', credits: 350, price_cents: 3500 },
  { pack_code: 'pack_400', display_name: '+400 credits', credits: 400, price_cents: 4000 },
  { pack_code: 'pack_450', display_name: '+450 credits', credits: 450, price_cents: 4500 },
  { pack_code: 'pack_500', display_name: '+500 credits', credits: 500, price_cents: 5000 },
  { pack_code: 'pack_550', display_name: '+550 credits', credits: 550, price_cents: 5000 },
];

const price = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    value / 100
  );

const dateLabel = (value: string | null | undefined) => {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const SettingsBillingPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isTopUpOpen, setIsTopUpOpen] = useState(searchParams.get('topup') === '1');

  const {
    isLoading: billingLoading,
    isCheckoutLoading,
    isPortalLoading,
    billingMode,
    checkoutAvailable,
    plans,
    creditPacks,
    subscription,
    startCheckout,
    openPortal,
    fetchCatalog,
  } = useBilling();
  const { isLoading: creditsLoading, wallet, plan, availableCredits } = useCredits();

  const visiblePlans = plans.length > 0 ? plans : FALLBACK_PLANS;
  const visiblePacks = creditPacks.length > 0 ? creditPacks : FALLBACK_PACKS;
  const requiredFromQuery = Number(searchParams.get('required') || 0);
  const availableFromQuery = Number(searchParams.get('available') || 0);

  const walletSummary = useMemo(() => {
    const monthlyQuota = wallet?.monthly_quota ?? plan?.monthly_quota ?? 100;
    const available = wallet?.available_total ?? availableCredits ?? 0;
    const percentage = monthlyQuota > 0
      ? Math.min(100, Math.max(0, (available / monthlyQuota) * 100))
      : (available > 0 ? 100 : 0);
    return { monthlyQuota, available, percentage };
  }, [wallet, availableCredits, plan]);

  const subscriptionPlanCode = subscription?.plan_code || plan?.plan_code || wallet?.plan_code || 'free';
  const renewDate = subscription?.current_period_end || wallet?.reset_at || null;

  useEffect(() => {
    const shouldOpen = searchParams.get('topup') === '1';
    if (shouldOpen) {
      setIsTopUpOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const handler = () => setIsTopUpOpen(true);
    window.addEventListener('billing:open-topup', handler);
    return () => window.removeEventListener('billing:open-topup', handler);
  }, []);

  const handleCloseModal = (open: boolean) => {
    setIsTopUpOpen(open);
    if (!open && searchParams.get('topup') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('topup');
      next.delete('required');
      next.delete('available');
      setSearchParams(next, { replace: true });
    }
  };

  const handlePackCheckout = async (packCode: string) => {
    const result = await startCheckout({ checkout_mode: 'pack', pack_code: packCode });
    if (!result.success) {
      toast.error(result.message || 'Checkout unavailable');
    }
  };

  const handlePlanCheckout = async (planCode: string) => {
    if (planCode === 'enterprise') {
      toast.info('Contact support for Enterprise onboarding.');
      return;
    }

    const result = await startCheckout({
      checkout_mode: 'subscription',
      plan_code: planCode,
      interval: 'month',
    });

    if (!result.success) {
      toast.error(result.message || 'Checkout unavailable');
    }
  };

  const handleOpenPortal = async () => {
    const result = await openPortal();
    if (!result.success) {
      toast.error(result.message || 'Customer portal unavailable');
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,rgba(249,115,22,0.18),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.14),transparent_40%),#09090b] text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link to={appRoutes.home} className="mb-3 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200">
              <ArrowLeft className="h-4 w-4" />
              Back to Studio
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight">Billing & Credits</h1>
            <p className="mt-2 text-sm text-zinc-400">
              {billingMode === 'disabled'
                ? 'Billing is not configured. Contact support for assistance.'
                : billingMode === 'test_only'
                ? 'Billing is in test mode. Payments are simulated.'
                : <>Monthly plan credits with top-up packs. Billing mode: <span className="font-medium text-zinc-200">{billingMode}</span></>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="border-zinc-700 bg-zinc-900/70 text-zinc-100 hover:bg-zinc-800" onClick={() => fetchCatalog()}>
              Refresh
            </Button>
            <Button
              variant="outline"
              className="border-zinc-700 bg-zinc-900/70 text-zinc-100 hover:bg-zinc-800"
              onClick={handleOpenPortal}
              disabled={isPortalLoading || !checkoutAvailable}
            >
              {isPortalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LifeBuoy className="mr-2 h-4 w-4" />}
              Manage Subscription
            </Button>
          </div>
        </div>

        {requiredFromQuery > 0 ? (
          <Card className="mb-6 border-amber-500/40 bg-amber-950/20 p-4 text-sm text-amber-100">
            Insufficient credits for the last generation request. Required: {Math.ceil(requiredFromQuery)}. Available:{' '}
            {Math.ceil(availableFromQuery)}.
          </Card>
        ) : null}

        <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-zinc-800 bg-zinc-950/70 p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Current plan</p>
                <h2 className="mt-2 text-2xl font-semibold capitalize">{subscriptionPlanCode}</h2>
              </div>
              <CircleDollarSign className="h-6 w-6 text-orange-400" />
            </div>
            <p className="text-sm text-zinc-400">Renews on {dateLabel(renewDate)}</p>
            {!checkoutAvailable ? (
              <p className="mt-3 text-xs text-amber-300">Checkout unavailable in current billing mode.</p>
            ) : null}
          </Card>

          <Card className="border-zinc-800 bg-zinc-950/70 p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Credits remaining</p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {creditsLoading ? '...' : Math.ceil(walletSummary.available).toLocaleString()}
                </h2>
              </div>
              <Coins className="h-6 w-6 text-amber-300" />
            </div>
            <Progress value={walletSummary.percentage} className="mb-3 h-2 bg-zinc-800" />
            <div className="mb-4 flex items-center justify-between text-xs text-zinc-400">
              <span>{Math.ceil(walletSummary.available)} available</span>
              <span>{walletSummary.monthlyQuota.toLocaleString()} monthly quota</span>
            </div>
            <Button
              className="w-full bg-amber-500 text-zinc-950 hover:bg-amber-400"
              onClick={() => setIsTopUpOpen(true)}
              disabled={!checkoutAvailable || isCheckoutLoading}
            >
              Top up credits
            </Button>
          </Card>
        </div>

        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Plans</h3>
            {(billingLoading || creditsLoading) && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {visiblePlans.map((billingPlan) => {
              const isCurrent = billingPlan.plan_code === subscriptionPlanCode;
              return (
                <Card
                  key={billingPlan.plan_code}
                  className={`relative border p-5 ${
                    isCurrent
                      ? 'border-orange-500/60 bg-orange-950/20'
                      : 'border-zinc-800 bg-zinc-950/50'
                  }`}
                >
                  {isCurrent ? (
                    <div className="absolute right-4 top-4 rounded-full bg-orange-500/20 px-2 py-1 text-[10px] uppercase tracking-wide text-orange-300">
                      Current
                    </div>
                  ) : null}
                  <h4 className="text-xl font-semibold">{billingPlan.display_name}</h4>
                  <p className="mt-2 text-sm text-zinc-400">{billingPlan.description}</p>
                  <p className="mt-4 text-3xl font-semibold">
                    {billingPlan.plan_code === 'enterprise' ? 'Contact us' : price(billingPlan.monthly_price_cents)}
                    {billingPlan.plan_code !== 'enterprise' ? <span className="text-sm text-zinc-500">/mo</span> : null}
                  </p>
                  <p className="mt-2 text-xs text-zinc-400">
                    {billingPlan.monthly_quota > 0
                      ? `${billingPlan.monthly_quota.toLocaleString()} monthly credits`
                      : 'Custom quota and invoicing'}
                  </p>
                  <Button
                    className="mt-5 w-full"
                    variant={isCurrent ? 'outline' : 'default'}
                    onClick={() => handlePlanCheckout(billingPlan.plan_code)}
                    disabled={isCurrent || isCheckoutLoading || !checkoutAvailable}
                  >
                    {billingPlan.plan_code === 'enterprise' ? 'Contact Sales' : isCurrent ? 'Current Plan' : 'Choose Plan'}
                  </Button>
                </Card>
              );
            })}
          </div>
        </div>

        <Card className="border-zinc-800 bg-zinc-950/60 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Billing docs</p>
              <p className="mt-2 text-sm text-zinc-300">Read billing mode, checkout, and webhook behavior before enabling live mode.</p>
            </div>
            <Link to={appRoutes.settings.billingDocs}>
              <Button variant="outline" className="border-zinc-700 bg-zinc-900/70 text-zinc-100 hover:bg-zinc-800">
                <FileText className="mr-2 h-4 w-4" />
                Open Docs
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      <Dialog open={isTopUpOpen} onOpenChange={handleCloseModal}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Top up credits</DialogTitle>
            <DialogDescription className="text-zinc-400">
              One-time packs. Charges are gated by billing mode and Stripe environment rules.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
            {visiblePacks.map((pack) => (
              <div key={pack.pack_code} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <div>
                  <p className="font-medium">{pack.display_name}</p>
                  <p className="text-xs text-zinc-400">{pack.credits} credits</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{price(pack.price_cents)}</span>
                  <Button
                    size="sm"
                    onClick={() => handlePackCheckout(pack.pack_code)}
                    disabled={isCheckoutLoading || !checkoutAvailable}
                  >
                    {isCheckoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buy'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {!checkoutAvailable ? <p className="text-xs text-amber-300">Checkout unavailable in current billing mode.</p> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsBillingPage;
