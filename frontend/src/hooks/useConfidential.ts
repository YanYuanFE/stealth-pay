import { useState, useCallback, useRef } from 'react';
import { TongoConfidential, fromAddress } from 'starkzap';
import type { ConfidentialRecipient } from 'starkzap';
import type { ProviderInterface } from 'starknet';
import { getErrorMessage } from '../lib/utils';

export interface ConfidentialAccount {
  confidential: TongoConfidential;
  balance: bigint;
  pending: bigint;
  nonce: bigint;
  address: string;
  recipientId: ConfidentialRecipient;
}

export function useConfidential(
  tongoContractAddress: string,
  provider: ProviderInterface | null,
) {
  const [account, setAccount] = useState<ConfidentialAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const confidentialRef = useRef<TongoConfidential | null>(null);

  const initialize = useCallback(async (privateKey: bigint) => {
    if (!provider || !tongoContractAddress || initializedRef.current) return;
    initializedRef.current = true;
    try {
      setLoading(true);
      setError(null);

      const confidential = new TongoConfidential({
        privateKey,
        contractAddress: fromAddress(tongoContractAddress),
        provider: provider as any,
      });
      confidentialRef.current = confidential;

      const state = await confidential.getState();

      // Convert from Tongo units back to ERC20 units for display
      const balancePublic = state.balance > 0n ? await confidential.toPublicUnits(state.balance) : 0n;
      const pendingPublic = state.pending > 0n ? await confidential.toPublicUnits(state.pending) : 0n;

      setAccount({
        confidential,
        balance: balancePublic,
        pending: pendingPublic,
        nonce: state.nonce,
        address: confidential.address,
        recipientId: confidential.recipientId,
      });
    } catch (err: unknown) {
      console.error('Failed to initialize confidential account:', err);
      setError(getErrorMessage(err, 'Failed to initialize'));
      initializedRef.current = false;
    } finally {
      setLoading(false);
    }
  }, [tongoContractAddress, provider]);

  const refreshState = useCallback(async () => {
    const c = confidentialRef.current;
    if (!c) return;
    setLoading(true);
    try {
      const state = await c.getState();
      const balancePublic = state.balance > 0n ? await c.toPublicUnits(state.balance) : 0n;
      const pendingPublic = state.pending > 0n ? await c.toPublicUnits(state.pending) : 0n;
      setAccount(prev => prev ? {
        ...prev,
        balance: balancePublic,
        pending: pendingPublic,
        nonce: state.nonce,
      } : null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to refresh'));
    } finally {
      setLoading(false);
    }
  }, []);

  return { account, loading, error, initialize, refreshState };
}
