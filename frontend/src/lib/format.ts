import { TOKENS } from '../config/tokens';

export function formatBalance(raw: bigint, tokenSymbol: string): string {
  const tokenInfo = TOKENS[tokenSymbol];
  if (!tokenInfo) return raw.toString();
  const divisor = 10n ** BigInt(tokenInfo.decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) return `${whole}`;
  return `${whole}.${frac.toString().padStart(tokenInfo.decimals, '0').replace(/0+$/, '')}`;
}
