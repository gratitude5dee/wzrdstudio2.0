import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { AnimatedLogo } from '@/components/ui/animated-logo';
import { GlassCard } from '@/components/ui/glass-card';
import { motion } from 'framer-motion';
import { ConnectEmbed } from "thirdweb/react";
import { getThirdwebClient } from '@/lib/thirdweb/client';
import { wallets } from '@/lib/thirdweb/wallets';
import { wzrdTheme } from '@/lib/thirdweb/theme';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { ThirdwebClient } from "thirdweb";
import { appRoutes, resolvePostLoginPath } from '@/lib/routes';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isWalletAuthenticating, walletAuthError } = useAuth();
  const [thirdwebClient, setThirdwebClient] = useState<ThirdwebClient | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  // Load Thirdweb client on mount
  useEffect(() => {
    getThirdwebClient()
      .then(setThirdwebClient)
      .catch((err) => {
        console.error('Failed to load Thirdweb client:', err);
        setConfigError(err.message);
      });
  }, []);

  // Only redirect once a real Supabase session exists.
  // Connecting a wallet alone is NOT enough — wallet-auth must complete first.
  useEffect(() => {
    if (user) {
      const nextFromQuery = new URLSearchParams(location.search).get('next');
      navigate(resolvePostLoginPath(nextFromQuery, appRoutes.home), { replace: true });
    }
  }, [user, navigate, location.search]);

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-[hsl(220_25%_4%)]">
      {/* Clean ambient background — no overlays, no vignette */}
      <div className="absolute inset-0">
        {/* Single soft nebula glow, top-center */}
        <div
          className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full blur-[120px] opacity-[0.12]"
          style={{
            background: 'radial-gradient(circle, hsl(var(--glow-primary)) 0%, hsl(var(--glow-secondary)) 50%, transparent 80%)',
          }}
        />

        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(hsl(var(--foreground) / 0.3) 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      {/* Sparse floating particles — 8 max, subtle */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-[2px] h-[2px] rounded-full"
            style={{
              left: `${15 + Math.random() * 70}%`,
              top: `${10 + Math.random() * 80}%`,
              backgroundColor: i % 2 === 0 ? 'hsl(var(--glow-primary))' : 'hsl(var(--glow-secondary))',
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.2, 0.5, 0.2],
            }}
            transition={{
              duration: Math.random() * 4 + 4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: Math.random() * 3,
            }}
          />
        ))}
      </div>

      {/* Auth Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[420px] mx-4"
      >
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-2xl shadow-[0_24px_80px_-12px_rgba(0,0,0,0.5)]">
          {/* Logo Header */}
          <div className="px-8 pt-10 pb-2">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="flex flex-col items-center gap-5 mb-6"
            >
              <AnimatedLogo size="lg" showVersion={true} autoplay={true} delay={0.3} />
              <div className="text-center space-y-2">
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
                  Welcome to <span className="bg-gradient-to-r from-[hsl(var(--glow-primary))] to-[hsl(var(--glow-secondary))] bg-clip-text text-transparent">WZRD Studio</span>
                </h1>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  Create cinematic AI-powered content
                </p>
              </div>
            </motion.div>
          </div>

          {/* Thirdweb Connect Embed */}
          <div className="px-6 pb-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              {configError ? (
                <div className="text-center py-8">
                  <p className="text-destructive text-sm">Failed to load authentication</p>
                  <p className="text-muted-foreground text-xs mt-2">{configError}</p>
                </div>
              ) : !thirdwebClient ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner size="lg" />
                </div>
              ) : (
                <>
                  <ConnectEmbed
                    client={thirdwebClient}
                    wallets={wallets}
                    theme={wzrdTheme}
                    modalSize="compact"
                    showThirdwebBranding={false}
                    className="!w-full !bg-transparent !border-0"
                  />
                  {isWalletAuthenticating ? (
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <LoadingSpinner size="sm" />
                      <span>Verifying wallet signature…</span>
                    </div>
                  ) : null}
                  {walletAuthError ? (
                    <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center">
                      <p className="text-xs text-destructive">{walletAuthError}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Disconnect and try again, or contact support if this keeps happening.
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </motion.div>
          </div>
        </div>

        {/* Footer Text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center text-muted-foreground/60 text-xs mt-6 tracking-wide"
        >
          By continuing, you agree to our Terms of Service
        </motion.p>
      </motion.div>
    </div>
  );
};

export default Login;
