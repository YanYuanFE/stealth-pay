import { useState, useEffect, useRef } from 'react';
import { useAccount, useProvider } from '@starknet-react/core';
import { Contract, hash as starknetHash } from 'starknet';
import { useConfidential } from '../../hooks/useConfidential';
import { loadTongoKey, derivePublicKey } from '../../lib/crypto';
import { buildRolloverCalls, buildWithdrawCalls, buildRagequitCalls } from '../../lib/stealthpay';
import { formatBalance } from '../../lib/format';
import { decryptSalary, isEmptySalary, parseEncryptedSalary } from '../../lib/salary-crypto';
import { toHex, getErrorMessage, tupleToPubKey } from '../../lib/utils';
import { toastTxSuccess, toastTxError, txUrl } from '../../lib/toast';
import { PAYROLL_FACTORY, DEFAULT_NETWORK } from '../../config/contracts';
import factoryAbi from '../../abi/payroll_factory.json';
import payrollAbi from '../../abi/payroll_manager.json';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CopyButton } from '../../components/CopyButton';

const FACTORY_ADDRESS = PAYROLL_FACTORY[DEFAULT_NETWORK];

export default function EmployeePortal() {
  const { account: walletAccount, address, status } = useAccount();
  const { provider } = useProvider();

  // Discovery state
  const [discovering, setDiscovering] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [payrollAddress, setPayrollAddress] = useState<string | null>(null);
  const [tongoContractAddress, setTongoContractAddress] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [decryptedSalary, setDecryptedSalary] = useState<bigint | null>(null);
  const discoveredRef = useRef(false);

  // Tongo confidential account
  const { account, loading, error, initialize, refreshState } = useConfidential(tongoContractAddress, provider);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [ragequitting, setRagequitting] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Auto-discover company from Tongo key
  useEffect(() => {
    if (!provider || discoveredRef.current) return;
    const key = loadTongoKey();
    if (!key) return;

    const discover = async () => {
      discoveredRef.current = true;
      setDiscovering(true);
      try {
        // 1. Derive pubkey from private key
        const pubkey = derivePublicKey(key);

        // 2. Compute poseidon hash (same as Cairo's poseidon_hash_span)
        const pubkeyHash = starknetHash.computePoseidonHashOnElements([pubkey.x, pubkey.y]);

        // 3. Query factory: get_employee_company(pubkey_hash)
        const factory = new Contract({ abi: factoryAbi, address: FACTORY_ADDRESS, providerOrAccount: provider });
        const result = await factory.get_employee_company(pubkeyHash);
        const payrollAddr = BigInt(result);

        if (payrollAddr === 0n) {
          setDiscovering(false);
          return; // Not registered at any company
        }

        const payrollHex = toHex(payrollAddr);
        setPayrollAddress(payrollHex);

        // 4. Read PayrollManager: get_tongo_contract, get_company_name, get_employer_pubkey
        const payroll = new Contract({ abi: payrollAbi, address: payrollHex, providerOrAccount: provider });

        const [tongoAddr, name, epk] = await Promise.all([
          payroll.get_tongo_contract(),
          payroll.get_company_name(),
          payroll.get_employer_pubkey(),
        ]);

        const tongoHex = toHex(tongoAddr);
        setTongoContractAddress(tongoHex);
        setCompanyName(typeof name === 'string' ? name : String(name));

        // 5. Detect token symbol from tongo contract address
        // Match against known tongo contracts
        const { TONGO_CONTRACTS } = await import('../../config/contracts');
        const contracts = TONGO_CONTRACTS[DEFAULT_NETWORK] as Record<string, string>;
        for (const [symbol, addr] of Object.entries(contracts)) {
          if (BigInt(addr) === BigInt(tongoAddr)) {
            setTokenSymbol(symbol);
            break;
          }
        }

        // 6. Try to decrypt salary
        try {
          // Find employee index by checking each employee
          const countResult = await payroll.get_employee_count();
          const count = Number(countResult);
          for (let i = 1; i <= count; i++) {
            const emp = await payroll.get_employee(i);
            const empPkX = toHex(emp[0]);
            const empPkY = toHex(emp[1]);
            if (empPkX === pubkey.x && empPkY === pubkey.y) {
              // Found our employee record, decrypt salary
              const salaryResult = await payroll.get_salary(i);
              if (salaryResult && salaryResult.length >= 6) {
                const encrypted = parseEncryptedSalary(salaryResult);
                if (!isEmptySalary(encrypted) && epk && epk.length >= 2) {
                  const employerPk = tupleToPubKey(epk);
                  const salary = await decryptSalary(
                    key,
                    employerPk,
                    encrypted,
                    payrollHex,
                  );
                  setDecryptedSalary(salary);
                }
              }
              break;
            }
          }
        } catch (err) {
          console.error('Failed to decrypt salary:', err);
        }

      } catch (err) {
        console.error('Discovery failed:', err);
      } finally {
        setDiscovering(false);
      }
    };

    discover();
  }, [provider]);

  // Initialize Tongo account AFTER tongoContractAddress is set
  useEffect(() => {
    if (!tongoContractAddress || !provider) return;
    const key = loadTongoKey();
    if (key) {
      initialize(key);
    }
  }, [tongoContractAddress, provider, initialize]);

  const handleRollover = async () => {
    if (!account || !address || !walletAccount) return;
    setProcessing(true);
    setTxStatus(null);
    try {
      const calls = await buildRolloverCalls(account.confidential, address);
      const tx = await walletAccount.execute(calls);
      setTxStatus(`Rollover submitted: ${tx.transaction_hash}`);
      toastTxSuccess('Rollover submitted', tx.transaction_hash);
      setTimeout(() => refreshState(), 8000);
    } catch (err: unknown) {
      setTxStatus(`Error: ${getErrorMessage(err, 'Failed')}`);
      toastTxError('Rollover failed', err);
    } finally {
      setProcessing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!account || !address || !walletAccount || !withdrawAmount || !tokenSymbol) return;
    setProcessing(true);
    setTxStatus(null);
    try {
      const calls = await buildWithdrawCalls(
        account.confidential, withdrawAmount, tokenSymbol, address, address,
      );
      const tx = await walletAccount.execute(calls);
      setTxStatus(`Withdraw submitted: ${tx.transaction_hash}`);
      toastTxSuccess('Withdrawal submitted', tx.transaction_hash);
      setWithdrawAmount('');
      setTimeout(() => refreshState(), 8000);
    } catch (err: unknown) {
      setTxStatus(`Error: ${getErrorMessage(err, 'Failed')}`);
      toastTxError('Withdrawal failed', err);
    } finally {
      setProcessing(false);
    }
  };

  const handleRagequit = async () => {
    if (!account || !walletAccount || !address) return;
    if (!window.confirm('Emergency withdrawal will transfer your ENTIRE confidential balance to your wallet. This cannot be undone. Continue?')) return;
    setRagequitting(true);
    try {
      const calls = await buildRagequitCalls(account.confidential, address, address);
      const tx = await walletAccount.execute(calls);
      toastTxSuccess('Emergency withdrawal submitted', tx.transaction_hash);
      // Refresh after confirmation
      setTimeout(() => window.location.reload(), 8000);
    } catch (err: unknown) {
      toastTxError('Emergency withdrawal failed', err);
    } finally {
      setRagequitting(false);
    }
  };

  const hasKey = !!loadTongoKey();
  const symbol = tokenSymbol || 'TOKEN';

  return (
    <div>
      <h1 className="text-2xl font-semibold font-serif text-[var(--fg)] mb-8 text-balance">My Salary</h1>

      {status !== 'connected' && (
        <div className="p-8 bg-[var(--bg-card)] border border-dashed border-[var(--border)] rounded-xl text-center mb-8">
          <p className="text-[var(--fg-muted)] text-pretty">Connect your wallet from the header</p>
        </div>
      )}

      {!hasKey && status === 'connected' && (
        <Alert variant="warning" className="mb-8">
          <AlertDescription>
            No Tongo key found. Go to <strong>Setup</strong> to generate or import your keypair.
          </AlertDescription>
        </Alert>
      )}

      {discovering && (
        <div className="p-8 text-center text-[var(--fg-muted)]">
          <div className="size-8 flex items-center justify-center mx-auto mb-4 text-[var(--brand)] font-medium">Loading...</div>
          <p className="text-pretty">Discovering your company...</p>
        </div>
      )}

      {hasKey && !discovering && !payrollAddress && !loading && (
        <Card className="mb-8 bg-[var(--bg-elevated)] text-center">
          <CardContent className="p-6">
            <p className="text-[var(--fg-muted)] text-sm mb-2 text-pretty">No company found for your Tongo key.</p>
            <p className="text-[var(--fg-faint)] text-xs text-pretty">Make sure your employer has registered you using your Tongo address.</p>
          </CardContent>
        </Card>
      )}

      {/* Company info */}
      {companyName && (
        <Alert variant="info" className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs text-[var(--brand)]">Employed at</p>
            <p className="text-lg font-semibold text-[var(--brand)]">{companyName}</p>
          </div>
          <div className="text-right">
            {decryptedSalary !== null && (
              <div>
                <p className="text-xs text-[var(--brand)]">Monthly Salary</p>
                <p className="text-lg font-semibold text-[var(--brand)] tabular-nums">{decryptedSalary.toString()} {symbol}</p>
              </div>
            )}
          </div>
        </Alert>
      )}

      {loading && (
        <div className="p-8 text-center text-[var(--fg-muted)]">
          <div className="size-8 flex items-center justify-center mx-auto mb-4 text-[var(--brand)] font-medium">Loading...</div>
          <p className="text-pretty">Decrypting balance...</p>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {account && (
        <>
          <div className="grid grid-cols-2 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-[var(--fg-muted)] mb-1">Available Balance</p>
                <p className="text-3xl font-bold text-[var(--alert-ok-fg)] tabular-nums">
                  {formatBalance(account.balance, symbol)} {symbol}
                </p>
                <p className="text-xs text-[var(--fg-faint)] mt-1">Decrypted locally with your private key</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-[var(--fg-muted)] mb-1">Pending Salary</p>
                <p className="text-3xl font-bold text-[var(--alert-warn-fg)] tabular-nums">
                  {formatBalance(account.pending, symbol)} {symbol}
                </p>
                <p className="text-xs text-[var(--fg-faint)] mt-1">
                  {account.pending > 0n ? 'Click Rollover to claim' : 'No pending payments'}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-3">Claim Pending</h3>
                <p className="text-sm text-[var(--fg-muted)] mb-4 text-pretty">
                  Move pending salary to your available balance.
                </p>
                <Button
                  onClick={handleRollover}
                  disabled={processing || account.pending === 0n}
                  className="w-full"
                  size="lg"
                >
                  {processing ? 'Processing...' : 'Rollover'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-3">Withdraw to Wallet</h3>
                <p className="text-sm text-[var(--fg-muted)] mb-3 text-pretty">
                  Convert confidential balance to regular {symbol}.
                </p>
                <Input
                  type="number"
                  min="0"
                  placeholder="Amount"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="mb-3"
                />
                <Button
                  variant="outline"
                  onClick={handleWithdraw}
                  disabled={processing || !withdrawAmount || account.balance === 0n}
                  className="w-full"
                  size="lg"
                >
                  {processing ? 'Processing...' : 'Withdraw'}
                </Button>
              </CardContent>
            </Card>
          </div>

          {account && account.pending > 0n && (
            <Alert variant="info" className="mb-6">
              <AlertDescription>
                <p className="font-medium mb-1">You have pending salary!</p>
                <p className="text-sm">
                  Incoming transfers are held in a pending state for security.
                  Click "Claim Pending" above to activate your balance for spending or withdrawal.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {account && account.balance > 0n && (
            <Card className="border-red-600/30 mt-6">
              <CardContent className="p-6">
                <h3 className="font-serif font-medium text-red-600 mb-1">Emergency Exit</h3>
                <p className="text-sm text-[var(--fg-muted)] mb-4 text-pretty">
                  Ragequit withdraws your entire confidential balance immediately. Use only in emergencies.
                </p>
                <Button variant="destructive" onClick={handleRagequit} disabled={ragequitting}>
                  {ragequitting ? 'Processing...' : 'Ragequit — Withdraw All'}
                </Button>
              </CardContent>
            </Card>
          )}

          {payrollAddress && (
            <Card className="bg-[var(--bg-elevated)] mb-4">
              <CardContent className="p-4">
                <p className="text-xs text-[var(--fg-muted)] mb-1">Company Contract</p>
                <div className="flex items-center gap-1">
                  <p className="font-mono text-xs text-[var(--fg)] break-all">{payrollAddress}</p>
                  <CopyButton text={payrollAddress} />
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-[var(--bg-elevated)]">
            <CardContent className="p-4">
              <p className="text-xs text-[var(--fg-muted)] mb-1">Your Tongo Address</p>
              <div className="flex items-center gap-1">
                <p className="font-mono text-xs text-[var(--fg)] break-all">{account.address}</p>
                <CopyButton text={account.address} />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {txStatus && (
        <Alert variant="info" className="mt-4">
          <AlertDescription>
            {txStatus.match(/^(Rollover submitted|Withdraw submitted): (0x[0-9a-fA-F]+)$/) ? (
              <>
                {txStatus.split(': ')[0]}:{' '}
                <a href={txUrl(txStatus.split(': ')[1])} target="_blank" rel="noopener noreferrer" className="underline text-[var(--brand)] hover:text-[var(--brand-hover)] font-mono text-xs">
                  {txStatus.split(': ')[1].slice(0, 16)}...
                </a>
              </>
            ) : txStatus}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
