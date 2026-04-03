import { TongoConfidential, Amount, fromAddress } from 'starkzap';
import type { ConfidentialRecipient } from 'starkzap';
import type { Call } from 'starknet';
import { TONGO_CONTRACTS, DEFAULT_NETWORK } from '../config/contracts';
import { TOKENS } from '../config/tokens';

export interface PayrollTransfer {
  recipient: ConfidentialRecipient; // { x, y }
  amount: string; // human-readable amount (e.g., "5000")
}

export interface PayrollResult {
  calls: Call[];
  totalAmount: string;
  employeeCount: number;
}

/**
 * Build confidential payroll transfer calls.
 * Each transfer generates a ZK proof client-side.
 */
export async function buildPayrollCalls(
  confidential: TongoConfidential,
  transfers: PayrollTransfer[],
  tokenSymbol: string,
  senderAddress: string,
): Promise<PayrollResult> {
  const tokenInfo = TOKENS[tokenSymbol];
  if (!tokenInfo) throw new Error(`Unknown token: ${tokenSymbol}`);

  const allCalls: Call[] = [];
  let totalRaw = 0n;

  for (const transfer of transfers) {
    if (!transfer.amount || parseFloat(transfer.amount) <= 0) continue;

    const parsedAmt = Amount.parse(transfer.amount, tokenInfo.decimals, tokenInfo.symbol);
    const tongoUnits = await confidential.toConfidentialUnits(parsedAmt);
    totalRaw += tongoUnits;

    const tongoAmount = Amount.fromRaw(tongoUnits, 0);
    const calls = await confidential.transfer({
      amount: tongoAmount,
      to: transfer.recipient,
      sender: fromAddress(senderAddress),
    });
    allCalls.push(...calls);
  }

  if (allCalls.length === 0) {
    throw new Error('No valid transfers to execute. All amounts are zero or empty.');
  }

  const totalAmount = Amount.fromRaw(totalRaw, tokenInfo.decimals, tokenInfo.symbol);

  return {
    calls: allCalls,
    totalAmount: totalAmount.toFormatted(),
    employeeCount: transfers.filter(t => parseFloat(t.amount) > 0).length,
  };
}

/**
 * Build fund calls to deposit ERC-20 into confidential account.
 * Amount is in human-readable token units (e.g., "5" for 5 STRK).
 * Internally converts to Tongo units if needed.
 */
export async function buildFundCalls(
  confidential: TongoConfidential,
  amount: string,
  tokenSymbol: string,
  senderAddress: string,
): Promise<Call[]> {
  const tokenInfo = TOKENS[tokenSymbol];
  if (!tokenInfo) throw new Error(`Unknown token: ${tokenSymbol}`);

  // Convert to Tongo units first to avoid 32-bit overflow in AEChaCha
  const parsedAmount = Amount.parse(amount, tokenInfo.decimals, tokenInfo.symbol);
  const tongoUnits = await confidential.toConfidentialUnits(parsedAmount);

  // Use Tongo units directly (0 decimals since already converted)
  const tongoAmount = Amount.fromRaw(tongoUnits, 0);
  return confidential.fund({
    amount: tongoAmount,
    sender: fromAddress(senderAddress),
  });
}

/**
 * Build withdraw calls to convert confidential balance back to ERC-20.
 */
export async function buildWithdrawCalls(
  confidential: TongoConfidential,
  amount: string,
  tokenSymbol: string,
  senderAddress: string,
  recipientAddress: string,
): Promise<Call[]> {
  const tokenInfo = TOKENS[tokenSymbol];
  if (!tokenInfo) throw new Error(`Unknown token: ${tokenSymbol}`);

  const parsedAmount = Amount.parse(amount, tokenInfo.decimals, tokenInfo.symbol);
  const tongoUnits = await confidential.toConfidentialUnits(parsedAmount);
  const tongoAmount = Amount.fromRaw(tongoUnits, 0);

  return confidential.withdraw({
    amount: tongoAmount,
    to: fromAddress(recipientAddress),
    sender: fromAddress(senderAddress),
  });
}

/**
 * Build rollover calls to activate pending balance.
 */
export async function buildRolloverCalls(
  confidential: TongoConfidential,
  senderAddress: string,
): Promise<Call[]> {
  return confidential.rollover({ sender: fromAddress(senderAddress) });
}

/**
 * Build ragequit calls for emergency full withdrawal.
 * Exits the entire confidential balance to a public address.
 */
export async function buildRagequitCalls(
  confidential: TongoConfidential,
  senderAddress: string,
  recipientAddress: string,
): Promise<Call[]> {
  return confidential.ragequit({
    to: fromAddress(recipientAddress),
    sender: fromAddress(senderAddress),
  });
}

/**
 * Get the Tongo contract address for a given token on the current network.
 */
export function getTongoContract(tokenSymbol: string): string {
  const contracts = TONGO_CONTRACTS[DEFAULT_NETWORK];
  const address = (contracts as Record<string, string>)[tokenSymbol];
  if (!address) throw new Error(`No Tongo contract for ${tokenSymbol} on ${DEFAULT_NETWORK}`);
  return address;
}
