import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import '@mysten/dapp-kit/dist/index.css';
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Self-hosted body + mono faces (no external font dependency for the static Walrus Site). The
// display face (Clash Display) is @font-face'd in index.css. Import order: fonts, then our css,
// so our @theme font-family vars resolve against the now-registered families.
import '@fontsource-variable/montserrat';
import '@fontsource-variable/jetbrains-mono';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// The Console reads Sui + Walrus directly and has no privileged backend. Network endpoints
// come from config (see config/), defaulting to testnet here for the scaffold. Uses the
// sui v2 JSON-RPC client (getFullnodeUrl/SuiClient were renamed; see the sui-2.0 migration).
const queryClient = new QueryClient();
const networks = {
  testnet: new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('testnet'), network: 'testnet' }),
  mainnet: new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet'), network: 'mainnet' }),
};

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </StrictMode>,
);
