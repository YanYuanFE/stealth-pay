import { useState, useEffect } from 'react';
import { useAccount, useProvider } from '@starknet-react/core';
import { buildPayrollCalls } from '../../lib/stealthpay';
import { useConfidential } from '../../hooks/useConfidential';
import { usePayrollContract } from '../../hooks/usePayrollContract';
import { loadTongoKey } from '../../lib/crypto';
import { decryptSalary, isEmptySalary } from '../../lib/salary-crypto';
import { formatBalance } from '../../lib/format';
import { getErrorMessage } from '../../lib/utils';
import { toastTxSuccess, toastTxError, txUrl } from '../../lib/toast';
import type { PayrollTransfer } from '../../lib/stealthpay';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface PayrollEntry {
  employeeIndex: number;
  pubkeyX: string;
  pubkeyY: string;
  amount: string;
  presetSalary: bigint | null;
}

type Step = 'input' | 'confirm' | 'processing' | 'done' | 'error';

export default function EmployerRunPayroll() {
  const { account: walletAccount, address } = useAccount();
  const { provider } = useProvider();
  const { employees, fetchEmployees, buildRecordRunCall, contractAddress, tongoContract, tokenSymbol } =
    usePayrollContract(provider, address);
  const activeEmployees = employees.filter((e) => e.isActive);
  const selectedToken = tokenSymbol || 'TOKEN';

  const { account, loading: confLoading, initialize } = useConfidential(tongoContract, provider);

  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [step, setStep] = useState<Step>('input');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proofProgress, setProofProgress] = useState(0);
  const [decrypting, setDecrypting] = useState(false);
  const [acks, setAcks] = useState({ amounts: false, irreversible: false });

  // Fetch employees from chain
  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Auto-initialize Tongo account
  useEffect(() => {
    const key = loadTongoKey();
    if (key && provider && tongoContract) {
      initialize(key);
    }
  }, [provider, tongoContract, initialize]);

  // Initialize entries and decrypt salaries when employees change
  useEffect(() => {
    const initEntries = async () => {
      const newEntries: PayrollEntry[] = activeEmployees.map((e) => ({
        employeeIndex: e.index,
        pubkeyX: e.pubkeyX,
        pubkeyY: e.pubkeyY,
        amount: '',
        presetSalary: null,
      }));

      // Try to decrypt pre-set salaries in parallel
      const privateKey = loadTongoKey();
      if (privateKey && contractAddress) {
        setDecrypting(true);
        const decryptPromises = newEntries.map(async (entry) => {
          const emp = activeEmployees.find((e) => e.index === entry.employeeIndex);
          if (!emp?.encryptedSalary || isEmptySalary(emp.encryptedSalary)) return null;
          try {
            return await decryptSalary(
              privateKey,
              { x: emp.pubkeyX, y: emp.pubkeyY },
              emp.encryptedSalary,
              contractAddress,
            );
          } catch { return null; }
        });
        const decryptedResults = await Promise.all(decryptPromises);
        for (let i = 0; i < newEntries.length; i++) {
          if (decryptedResults[i] !== null) {
            newEntries[i].presetSalary = decryptedResults[i];
            newEntries[i].amount = decryptedResults[i]!.toString();
          }
        }
        setDecrypting(false);
      }

      setEntries(newEntries);
    };

    initEntries();
  }, [employees, contractAddress]);

  const totalAmount = entries.reduce(
    (sum, e) => sum + (parseFloat(e.amount) || 0),
    0,
  );

  const handleAmountChange = (index: number, amount: string) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, amount } : e)),
    );
  };

  const handleExecute = async () => {
    if (!account || !address || !walletAccount) return;
    setStep('processing');
    setErrorMsg(null);

    try {
      // Build transfers
      const transfers: PayrollTransfer[] = entries
        .filter((e) => parseFloat(e.amount) > 0)
        .map((e) => ({
          recipient: { x: e.pubkeyX, y: e.pubkeyY },
          amount: e.amount,
        }));

      setProofProgress(10);

      // Generate ZK proofs and build calls
      const result = await buildPayrollCalls(
        account.confidential,
        transfers,
        selectedToken,
        address,
      );

      setProofProgress(80);

      // Build record_payroll_run call
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const runId = '0x' + Array.from(randomBytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
      const commitment = '0x' + Array.from(randomBytes.slice(8, 16)).map(b => b.toString(16).padStart(2, '0')).join('');
      const recordCall = buildRecordRunCall(runId, result.employeeCount, commitment);

      // Execute all in one multicall (transfers + record)
      const allCalls = [...result.calls, recordCall];
      console.log('[payroll] Executing multicall:', allCalls.length, 'calls');
      const tx = await walletAccount.execute(allCalls);
      setTxHash(tx.transaction_hash);
      setProofProgress(100);
      toastTxSuccess('Payroll executed', tx.transaction_hash);
      setStep('done');
    } catch (err: unknown) {
      console.error('Payroll execution failed:', err);
      const msg = getErrorMessage(err, 'Transaction failed');
      // Try to extract revert reason
      const errStr = String(err);
      const revertMatch = errStr.match(/execution_error.*?"([^"]+)"/i) || errStr.match(/revert.*?:(.+)/i);
      setErrorMsg(revertMatch ? `${msg}\nReason: ${revertMatch[1].trim()}` : msg);
      toastTxError('Payroll failed', err);
      setStep('error');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold font-serif text-[var(--fg)] mb-6 text-balance">Run Payroll</h1>

      {/* Balance display */}
      {account && (
        <Card className="mb-6">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--fg-muted)]">Confidential Balance</p>
              <p className="text-xl font-bold text-[var(--brand)] tabular-nums">
                {formatBalance(account.balance, selectedToken)} {selectedToken}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-[var(--fg-muted)]">Tongo Address</p>
              <p className="text-xs font-mono text-[var(--fg-faint)]">
                {account.address.slice(0, 16)}...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!account && !confLoading && (
        <Alert variant="warning" className="mb-6">
          <AlertDescription>
            No Tongo key found. Generate or import one in the company registration step.
          </AlertDescription>
        </Alert>
      )}

      {step === 'input' && (
        <>
          {decrypting && (
            <Alert variant="info" className="mb-4">
              <AlertDescription>Decrypting pre-set salaries...</AlertDescription>
            </Alert>
          )}

          <Card className="overflow-hidden mb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>PubKey</TableHead>
                  <TableHead className="text-center">Pre-set</TableHead>
                  <TableHead className="text-right">Amount ({selectedToken})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, i) => (
                  <TableRow key={entry.employeeIndex}>
                    <TableCell className="text-[var(--fg)]">
                      #{entry.employeeIndex}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[var(--fg-muted)]">
                      {entry.pubkeyX.slice(0, 10)}...
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {entry.presetSalary !== null ? (
                        <span className="text-[var(--alert-ok-fg)] font-medium">
                          {entry.presetSalary.toString()}
                        </span>
                      ) : (
                        <span className="text-[var(--fg-faint)]">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={entry.amount}
                        onChange={(e) => handleAmountChange(i, e.target.value)}
                        className="w-32 text-right inline-flex"
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {entries.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-[var(--fg-faint)] py-8"
                    >
                      No active employees. Register employees first.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <Card>
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--fg-muted)]">Total Payroll</p>
                <p className="text-2xl font-bold text-[var(--fg)] tabular-nums">
                  {totalAmount.toFixed(2)} {selectedToken}
                </p>
              </div>
              <Button
                onClick={() => setStep('confirm')}
                disabled={totalAmount === 0 || !account}
                size="lg"
              >
                Review & Execute
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {step === 'confirm' && (
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold font-serif text-[var(--fg)] mb-4 text-balance">
            Confirm Payroll Execution
          </h2>
          <p className="text-[var(--fg-muted)] mb-2 text-pretty">
            {entries.filter((e) => parseFloat(e.amount) > 0).length} employees
          </p>
          <p className="text-3xl font-bold text-[var(--brand)] mb-6 tabular-nums">
            {totalAmount.toFixed(2)} {selectedToken}
          </p>
          <p className="text-sm text-[var(--fg-muted)] mb-6 text-pretty">
            ZK proofs will be generated for each transfer. This may take a
            moment. Salary amounts will be fully encrypted on-chain.
          </p>
          <div className="bg-[var(--bg-elevated)] rounded-lg p-4 mb-6 max-h-48 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--fg-muted)] text-xs">
                  <th className="text-left pb-2">#</th>
                  <th className="text-left pb-2">Employee</th>
                  <th className="text-right pb-2">Amount ({selectedToken})</th>
                </tr>
              </thead>
              <tbody>
                {entries.filter(e => parseFloat(e.amount) > 0).map((e) => (
                  <tr key={e.employeeIndex} className="border-t border-[var(--border-muted)]">
                    <td className="py-1.5 text-[var(--fg-muted)]">{e.employeeIndex}</td>
                    <td className="py-1.5 font-mono text-xs text-[var(--fg-muted)]">Employee #{e.employeeIndex}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{e.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 mb-6">
            <label className="flex items-start gap-3 text-sm text-[var(--fg-muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={acks.amounts}
                onChange={(e) => setAcks(prev => ({ ...prev, amounts: e.target.checked }))}
                className="mt-0.5 size-4 rounded border-[var(--border)]"
              />
              I have verified all salary amounts are correct
            </label>
            <label className="flex items-start gap-3 text-sm text-[var(--fg-muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={acks.irreversible}
                onChange={(e) => setAcks(prev => ({ ...prev, irreversible: e.target.checked }))}
                className="mt-0.5 size-4 rounded border-[var(--border)]"
              />
              I understand this action is irreversible once submitted
            </label>
          </div>
          <div className="flex gap-4 justify-center">
            <Button
              variant="outline"
              onClick={() => { setStep('input'); setAcks({ amounts: false, irreversible: false }); }}
            >
              Back
            </Button>
            <Button
              onClick={handleExecute}
              disabled={!acks.amounts || !acks.irreversible}
            >
              Execute Payroll
            </Button>
          </div>
        </Card>
      )}

      {step === 'processing' && (
        <Card className="p-12 text-center">
          <div className="size-12 flex items-center justify-center mx-auto mb-6 text-[var(--brand)] font-medium">Processing...</div>
          <h2 className="text-xl font-semibold font-serif text-[var(--fg)] mb-2 text-balance">
            Processing Payroll
          </h2>
          <p className="text-[var(--fg-muted)] mb-4 text-pretty">
            Generating ZK proofs and submitting transaction...
          </p>
          <div className="w-64 mx-auto bg-[var(--border)] rounded-full h-2">
            <div
              className="bg-[var(--brand)] h-2 rounded-full transition-all duration-500"
              style={{ width: `${proofProgress}%` }}
            />
          </div>
          <p className="text-xs text-[var(--fg-faint)] mt-2 tabular-nums">{proofProgress}%</p>
        </Card>
      )}

      {step === 'done' && (
        <Card className="p-12 text-center">
          <div className="text-5xl mb-4 text-[var(--alert-ok-fg)]">&#10003;</div>
          <h2 className="text-xl font-semibold font-serif text-[var(--alert-ok-fg)] mb-2 text-balance">
            Payroll Executed
          </h2>
          <p className="text-[var(--fg-muted)] mb-4 text-pretty">
            All salary transfers submitted with encrypted amounts.
          </p>
          {txHash && (
            <p className="text-xs font-mono text-[var(--fg-faint)] mb-6">
              Tx:{' '}
              <a href={txUrl(txHash)} target="_blank" rel="noopener noreferrer" className="underline text-[var(--brand)] hover:text-[var(--brand-hover)]">
                {txHash.slice(0, 20)}...{txHash.slice(-8)}
              </a>
            </p>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setStep('input');
              setTxHash(null);
              setAcks({ amounts: false, irreversible: false });
            }}
          >
            Run Another Payroll
          </Button>
        </Card>
      )}

      {step === 'error' && (
        <Card className="p-12 text-center border-red-200">
          <div className="text-5xl mb-4 text-[var(--alert-err-fg)]">&#10007;</div>
          <h2 className="text-xl font-semibold font-serif text-[var(--alert-err-fg)] mb-2 text-balance">
            Payroll Failed
          </h2>
          <p className="text-[var(--fg-muted)] mb-4 text-pretty">{errorMsg}</p>
          <Button
            variant="outline"
            onClick={() => { setStep('input'); setAcks({ amounts: false, irreversible: false }); }}
          >
            Try Again
          </Button>
        </Card>
      )}
    </div>
  );
}
