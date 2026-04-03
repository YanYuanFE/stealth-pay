import type { ProviderInterface } from 'starknet';

/** Convert BigInt or numeric value to hex string with 0x prefix */
export function toHex(value: bigint | string | number): string {
  return '0x' + BigInt(value).toString(16);
}

/** Truncate address/hash for display */
export function truncateAddress(addr: string, prefix = 6, suffix = 4): string {
  if (addr.length <= prefix + suffix + 3) return addr;
  return `${addr.slice(0, prefix)}...${addr.slice(-suffix)}`;
}

/** Extract error message from unknown error */
export function getErrorMessage(err: unknown, fallback = 'Unknown error'): string {
  return err instanceof Error ? err.message : fallback;
}

/** Poll for transaction receipt confirmation */
export async function waitForTx(
  provider: ProviderInterface,
  txHash: string,
  maxRetries = 15,
  intervalMs = 3000,
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) return true;
    } catch { /* not ready */ }
  }
  return false;
}

/** Parse contract tuple result to pubkey object */
export function tupleToPubKey(tuple: unknown[]): { x: string; y: string } {
  return { x: toHex(tuple[0] as bigint), y: toHex(tuple[1] as bigint) };
}
