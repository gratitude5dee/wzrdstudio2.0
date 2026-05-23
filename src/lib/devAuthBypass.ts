export const isDevAuthBypassEnabled = () =>
  import.meta.env.DEV && import.meta.env.VITE_BYPASS_AUTH_FOR_TESTS === 'true';
