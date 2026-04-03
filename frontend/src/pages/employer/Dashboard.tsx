import { useEffect, useState } from 'react';
import { useAccount, useProvider } from '@starknet-react/core';
import { Contract } from 'starknet';
import { pubKeyAffineToBase58 } from '@fatsolutions/tongo-sdk';
import { usePayrollContract } from '../../hooks/usePayrollContract';
import payrollAbi from '../../abi/payroll_manager.json';
import { useConfidential } from '../../hooks/useConfidential';
import { loadTongoKey } from '../../lib/crypto';
import { formatBalance } from '../../lib/format';
import { PAYROLL_FACTORY, DEFAULT_NETWORK } from '../../config/contracts';
import { toastTxSuccess, toastTxError, contractUrl } from '../../lib/toast';
import { CopyButton } from '../../components/CopyButton';
import { Link } from 'react-router-dom';
import EmployerSetup from './Setup';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function EmployerDashboard() {
  const { status, address, account: walletAccount } = useAccount();
  const { provider } = useProvider();
  const {
    employees, companyName, runCount, loading,
    contractAddress, tongoContract, tokenSymbol,
  } = usePayrollContract(provider, address);

  const { account, initialize } = useConfidential(tongoContract, provider);

  const FACTORY_ADDRESS = PAYROLL_FACTORY[DEFAULT_NETWORK];
  const [deleting, setDeleting] = useState(false);
  const [auditorAddress, setAuditorAddress] = useState<string | null>(null);

  // Read auditor from contract
  useEffect(() => {
    if (!contractAddress || !provider) return;
    const read = async () => {
      try {
        const c = new Contract({ abi: payrollAbi, address: contractAddress, providerOrAccount: provider });
        const result = await c.get_auditor();
        const vals = Object.values(result);
        const x = BigInt(vals[0] as string | number | bigint);
        const y = BigInt(vals[1] as string | number | bigint);
        if (x !== 0n || y !== 0n) {
          setAuditorAddress(pubKeyAffineToBase58({ x, y }));
        }
      } catch { /* no auditor */ }
    };
    read();
  }, [contractAddress, provider]);

  useEffect(() => {
    const key = loadTongoKey(address);
    if (key && provider && tongoContract) {
      initialize(key);
    }
  }, [provider, tongoContract, initialize, address]);

  const handleDelete = async () => {
    if (!walletAccount || !window.confirm('Are you sure? This will permanently remove your company registration.')) return;
    setDeleting(true);
    try {
      const tx = await walletAccount.execute([{
        contractAddress: FACTORY_ADDRESS,
        entrypoint: 'delete_company',
        calldata: [],
      }]);
      toastTxSuccess('Company deleted', tx.transaction_hash);
      window.location.href = '/';
    } catch (err) {
      toastTxError('Delete failed', err);
      console.error(err);
      setDeleting(false);
    }
  };

  const activeCount = employees.filter(e => e.isActive).length;
  const symbol = tokenSymbol || 'TOKEN';

  // No company registered → show onboarding
  if (status === 'connected' && !loading && !contractAddress) {
    return <EmployerSetup />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold font-serif text-[var(--fg)] text-balance">{companyName || 'Employer Dashboard'}</h1>
          {companyName && <p className="text-sm text-[var(--fg-muted)] mt-0.5">Employer Dashboard</p>}
          {contractAddress && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
              <p className="text-xs font-mono text-[var(--fg-faint)] inline-flex items-center gap-1">
                <span className="text-[var(--fg-muted)]">Contract:</span>
                <a href={contractUrl(contractAddress)} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--brand)]">
                  {contractAddress.slice(0, 10)}...{contractAddress.slice(-6)}
                </a>
                <CopyButton text={contractAddress} />
              </p>
              {auditorAddress && (
                <p className="text-xs font-mono text-[var(--fg-faint)] inline-flex items-center gap-1">
                  <span className="text-[var(--fg-muted)]">Auditor:</span>
                  {auditorAddress.slice(0, 8)}...{auditorAddress.slice(-6)}
                  <CopyButton text={auditorAddress} />
                </p>
              )}
            </div>
          )}
        </div>
        {status !== 'connected' && (
          <p className="text-sm text-[var(--fg-muted)] text-pretty">Connect your wallet to get started</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-[var(--fg-muted)]">Confidential Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-[var(--brand)] tabular-nums">
              {account ? formatBalance(account.balance, symbol) : '\u2014'}
            </p>
            <p className="text-xs text-[var(--fg-faint)] mt-1">
              {account ? `${symbol} \u00b7 Encrypted on-chain` : 'Set up Tongo key to view'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-[var(--fg-muted)]">Active Employees</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-[var(--fg)] tabular-nums">{loading ? '...' : activeCount}</p>
            <p className="text-xs text-[var(--fg-faint)] mt-1">{employees.length} total registered</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-[var(--fg-muted)]">Payroll Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-[var(--fg)] tabular-nums">{loading ? '...' : runCount}</p>
            <p className="text-xs text-[var(--fg-faint)] mt-1">On-chain records</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        {[
          { to: '/employer/payroll', title: 'Run Payroll', desc: 'Execute confidential salary transfers' },
          { to: '/employer/employees', title: 'Manage Employees', desc: 'Register or deactivate employees' },
          { to: '/employer/fund', title: 'Fund Account', desc: 'Deposit tokens into confidential account' },
          { to: '/employer/history', title: 'Payroll History', desc: 'View past payroll runs and records' },
        ].map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="group"
          >
            <Card className="hover:border-[var(--brand)] hover:shadow-md cursor-pointer h-full">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-[var(--fg)] group-hover:text-[var(--brand)]">{card.title}</h3>
                  <span className="text-[var(--fg-faint)] group-hover:text-[var(--brand)] group-hover:translate-x-0.5 inline-block">&rarr;</span>
                </div>
                <p className="text-sm text-[var(--fg-muted)] text-pretty">{card.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {contractAddress && (
        <Card className="border-red-200 mt-8">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-red-600">Delete Company</h3>
              <p className="text-sm text-[var(--fg-muted)] text-pretty">Remove your company registration. This cannot be undone.</p>
            </div>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete Company'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
