import { useSuiClientContext } from '@mysten/dapp-kit';
import { isEnokiNetwork, registerEnokiWallets } from '@mysten/enoki';
import { useEffect } from 'react';

const ENOKI_API_KEY = import.meta.env.VITE_ENOKI_API_KEY;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_ENOKI_GOOGLE_CLIENT_ID;

/** Whether "Sign in with Reeg" (Enoki zkLogin) is configured for this build. */
export function enokiConfigured(): boolean {
  return Boolean(ENOKI_API_KEY && GOOGLE_CLIENT_ID);
}

/**
 * "Sign in with Reeg" = Enoki zkLogin, registered as a Wallet-Standard wallet so it appears in the
 * dapp-kit ConnectButton next to any browser wallet. The user signs in with Google and gets a Sui
 * address with no seed phrase — no Reeg backend in the loop for the login itself. Renders nothing.
 *
 * No-ops when the env is unset (the design sandbox / preview build), so the Console still loads
 * without Enoki keys. The OAuth redirect is pinned to the app origin, so a single Google "Authorized
 * redirect URI" per environment suffices regardless of the current route.
 */
export function RegisterEnokiWallets(): null {
  const { client, network } = useSuiClientContext();
  useEffect(() => {
    if (!ENOKI_API_KEY || !GOOGLE_CLIENT_ID || !isEnokiNetwork(network)) {
      return;
    }
    const { unregister } = registerEnokiWallets({
      apiKey: ENOKI_API_KEY,
      providers: { google: { clientId: GOOGLE_CLIENT_ID, redirectUrl: window.location.origin } },
      client,
      network,
    });
    return unregister;
  }, [client, network]);
  return null;
}
