import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useProvider } from '@starknet-react/core';
import { useConfidential } from '../../hooks/useConfidential';
import { usePayrollContract } from '../../hooks/usePayrollContract';
import { loadTongoKey } from '../../lib/crypto';
import { buildFundCalls } from '../../lib/stealthpay';
import { formatBalance } from '../../lib/format';
import { getErrorMessage, waitForTx } from '../../lib/utils';
import { toastTxSuccess, toastTxError, txUrl } from '../../lib/toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function EmployerFund() {
  const { account: walletAccount, address, status } = useAccount();
  const { provider } = useProvider();
  const { tongoContract, tokenSymbol } = usePayrollContract(provider, address);

  const { account, loading: confLoading, initialize, refreshState } = useConfidential(tongoContract, provider);
  const [amount, setAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  useEffect(() => {
    const key = loadTongoKey();
    if (key && provider && tongoContract) {
      initialize(key);
    }
  }, [provider, tongoContract, initialize]);

  const symbol = tokenSymbol || 'TOKEN';

  const handleFund = async () => {
    if (!walletAccount || !account || !address || !amount || !tokenSymbol) return;
    setProcessing(true);
    setTxStatus(null);
    try {
      const calls = await buildFundCalls(account.confidential, amount, tokenSymbol, address);
      const tx = await walletAccount.execute(calls);
      setTxStatus(`Deposit submitted! Tx: ${tx.transaction_hash}`);
      toastTxSuccess('Deposit submitted', tx.transaction_hash);
      setAmount('');
      waitForTx(provider, tx.transaction_hash).then(() => refreshState()).catch(console.error);
    } catch (err: unknown) {
      setTxStatus(`Error: ${getErrorMessage(err, 'Transaction failed')}`);
      toastTxError('Deposit failed', err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold font-serif text-[var(--fg)] mb-8 text-balance">Fund Confidential Account</h1>

      {status !== 'connected' && (
        <div className="p-8 border border-dashed border-[var(--border)] rounded-xl text-center mb-8">
          <p className="text-[var(--fg-muted)] text-pretty">Connect wallet from the header to deposit tokens</p>
        </div>
      )}

      {account && (
        <div className="grid grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-normal text-[var(--fg-muted)]">Confidential Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-[var(--brand)] tabular-nums">
                {formatBalance(account.balance, symbol)} {symbol}
              </p>
              <p className="text-xs text-[var(--fg-faint)] mt-1">Available for payroll transfers</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-normal text-[var(--fg-muted)]">Pending Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-amber-600 tabular-nums">
                {formatBalance(account.pending, symbol)} {symbol}
              </p>
              <p className="text-xs text-[var(--fg-faint)] mt-1">Tongo Address: {account.address.slice(0, 12)}...</p>
            </CardContent>
          </Card>
        </div>
      )}

      {address && (
        <Card className="p-8">
          <h2 className="text-lg font-semibold font-serif text-[var(--fg)] mb-6 text-balance">Deposit {symbol}</h2>

          <div className="mb-6">
            <label className="block text-sm text-[var(--fg-muted)] mb-2">Amount</label>
            <Input
              type="number"
              min="0"
              placeholder={`0.00 ${symbol}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="py-3 text-lg"
            />
          </div>

          <Alert variant="info" className="mb-6">
            <AlertDescription>
              <p>This will:</p>
              <ol className="list-decimal ml-4 mt-2 space-y-1">
                <li>Approve the Tongo contract to spend your {symbol}</li>
                <li>Deposit into your confidential account (encrypted on-chain)</li>
              </ol>
              <p className="mt-2 text-amber-600">Note: The deposit amount is visible on-chain. Individual salary transfers are encrypted.</p>
              <p className="mt-2 text-[var(--fg-faint)] text-xs">
                Note: Tongo balances are limited to 2³² units (~4.29 billion). Large deposits may exceed this limit.
              </p>
            </AlertDescription>
          </Alert>

          <Button
            onClick={handleFund}
            disabled={processing || !amount || !account || parseFloat(amount) <= 0}
            className="w-full py-3 text-lg"
            size="lg"
          >
            {processing ? 'Processing...' : `Deposit ${amount || '0'} ${symbol}`}
          </Button>
        </Card>
      )}

      {!account && address && !confLoading && (
        <Alert variant="warning" className="mt-6">
          <AlertDescription>
            <p className="text-pretty">No Tongo key found. Go to Employee Setup to generate a keypair, or import an existing one.</p>
            <Link
              to="/employer/setup"
              className="mt-3 inline-block px-4 py-2 bg-[var(--brand)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-hover)]"
            >
              Go to Setup
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {txStatus && (
        <Alert variant="info" className="mt-6">
          <AlertDescription>
            {txStatus.startsWith('Deposit submitted! Tx: ') ? (
              <>
                Deposit submitted! Tx:{' '}
                <a href={txUrl(txStatus.replace('Deposit submitted! Tx: ', ''))} target="_blank" rel="noopener noreferrer" className="underline text-[var(--brand)] hover:text-[var(--brand-hover)] font-mono text-xs">
                  {txStatus.replace('Deposit submitted! Tx: ', '').slice(0, 20)}...
                </a>
              </>
            ) : txStatus}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
