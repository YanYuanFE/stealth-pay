import { type ReactNode } from 'react';
import { sepolia } from '@starknet-react/chains';
import { StarknetConfig, jsonRpcProvider, voyager } from '@starknet-react/core';
import { InjectedConnector } from 'starknetkit/injected';
import { SEPOLIA_RPC_URL } from '../config/contracts';

const connectors = [
  new InjectedConnector({ options: { id: 'argentX', name: 'Argent X' } }),
  new InjectedConnector({ options: { id: 'braavos', name: 'Braavos' } }),
];

const provider = jsonRpcProvider({
  rpc: () => ({ nodeUrl: SEPOLIA_RPC_URL }),
});

export default function StarknetProvider({ children }: { children: ReactNode }) {
  return (
    <StarknetConfig
      chains={[sepolia]}
      provider={provider}
      connectors={connectors as any}
      explorer={voyager}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}
