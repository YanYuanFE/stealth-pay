import { useState, useEffect } from 'react';
import { useAccount, useProvider } from '@starknet-react/core';
import { Contract } from 'starknet';
import { pubKeyBase58ToAffine, pubKeyAffineToBase58 } from '@fatsolutions/tongo-sdk';
import { usePayrollContract } from '../../hooks/usePayrollContract';
import { encryptSalary, decryptSalary, isEmptySalary } from '../../lib/salary-crypto';
import { loadTongoKey } from '../../lib/crypto';
import { toHex, getErrorMessage, waitForTx } from '../../lib/utils';
import type { EncryptedSalary } from '../../lib/salary-crypto';
import payrollAbi from '../../abi/payroll_manager.json';
import { CopyButton } from '../../components/CopyButton';
import { toastTxSuccess, toastTxError } from '../../lib/toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const CADENCE_LABELS: Record<number, string> = { 1: 'Monthly', 2: 'Semi-monthly', 3: 'Weekly' };

export default function EmployerEmployees() {
  const { account, address, status } = useAccount();
  const { provider } = useProvider();
  const {
    employees, loading, fetchEmployees,
    buildRegisterCall, buildDeactivateCall, buildReactivateCall, buildSetCadenceCall,
    contractAddress, tokenSymbol,
  } = usePayrollContract(provider, address);
  const symbol = tokenSymbol || 'TOKEN';

  const [tongoAddress, setTongoAddress] = useState('');
  const [salaryInput, setSalaryInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [decryptedSalaries, setDecryptedSalaries] = useState<Record<number, bigint>>({});
  const [tongoAddresses, setTongoAddresses] = useState<Record<number, string>>({});

  // Auditor public key (for encrypting audit salary copy)
  const [auditorPubKey, setAuditorPubKey] = useState<{ x: string; y: string } | null>(null);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editSalary, setEditSalary] = useState('');
  const [editCadence, setEditCadence] = useState('1');
  const [editSaving, setEditSaving] = useState(false);

  // Read auditor public key from the contract
  useEffect(() => {
    if (!contractAddress || !provider) return;
    const readAuditor = async () => {
      try {
        const c = new Contract({ abi: payrollAbi, address: contractAddress, providerOrAccount: provider });
        const result = await c.get_auditor();
        const vals = Object.values(result);
        const x = BigInt(vals[0] as string | number | bigint);
        const y = BigInt(vals[1] as string | number | bigint);
        if (x !== 0n || y !== 0n) {
          setAuditorPubKey({ x: toHex(x), y: toHex(y) });
        }
      } catch { /* no auditor */ }
    };
    readAuditor();
  }, [contractAddress, provider]);

  useEffect(() => {
    if (employees.length === 0) return;
    const addrs: Record<number, string> = {};
    for (const emp of employees) {
      try {
        addrs[emp.index] = pubKeyAffineToBase58({ x: BigInt(emp.pubkeyX), y: BigInt(emp.pubkeyY) });
      } catch { /* ignore */ }
    }
    setTongoAddresses(addrs);

    const privateKey = loadTongoKey();
    if (!privateKey || !contractAddress) return;
    const decrypt = async () => {
      const results: Record<number, bigint> = {};
      for (const emp of employees) {
        if (!emp.encryptedSalary || isEmptySalary(emp.encryptedSalary)) continue;
        try {
          results[emp.index] = await decryptSalary(privateKey, { x: emp.pubkeyX, y: emp.pubkeyY }, emp.encryptedSalary, contractAddress);
        } catch { /* ignore */ }
      }
      setDecryptedSalaries(results);
    };
    decrypt();
  }, [employees, contractAddress]);

  const openEditDialog = (index: number) => {
    const emp = employees.find(e => e.index === index);
    if (!emp) return;
    setEditIndex(index);
    setEditSalary(decryptedSalaries[index]?.toString() || '');
    setEditCadence(String(emp.cadence || 1));
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (editIndex === null || !address || !account) return;
    const emp = employees.find(e => e.index === editIndex);
    if (!emp) return;

    setEditSaving(true);
    try {
      const calls = [];

      // Update salary if changed
      const newSalary = Number(editSalary);
      const oldSalary = decryptedSalaries[editIndex];
      if (editSalary && newSalary > 0 && (!oldSalary || BigInt(newSalary) !== oldSalary)) {
        if (!Number.isFinite(newSalary) || !Number.isInteger(newSalary)) throw new Error('Salary must be a positive whole number');
        if (newSalary >= 2 ** 32) throw new Error('Salary must be less than 4,294,967,296');
        const privateKey = loadTongoKey();
        if (!privateKey) throw new Error('No Tongo key found');
        const encrypted = await encryptSalary(privateKey, { x: emp.pubkeyX, y: emp.pubkeyY }, BigInt(newSalary), contractAddress);
        calls.push({
          contractAddress,
          entrypoint: 'set_salary',
          calldata: [
            editIndex.toString(),
            encrypted.cipher0.toString(), encrypted.cipher1.toString(),
            encrypted.cipher2.toString(), encrypted.cipher3.toString(),
            encrypted.nonceLow.toString(), encrypted.nonceHigh.toString(),
          ],
        });
      }

      // Update cadence if changed
      const newCadence = Number(editCadence);
      if (newCadence !== (emp.cadence || 1)) {
        calls.push(buildSetCadenceCall(editIndex, newCadence));
      }

      if (calls.length === 0) {
        setEditOpen(false);
        return;
      }

      const tx = await account.execute(calls);
      toastTxSuccess('Employee updated', tx.transaction_hash);
      setEditOpen(false);
      waitForTx(provider, tx.transaction_hash).then(() => fetchEmployees()).catch(console.error);

      // Update audit salary copy if auditor is set
      if (auditorPubKey && editSalary) {
        try {
          const auditKey = loadTongoKey();
          if (auditKey) {
            const auditEnc = await encryptSalary(auditKey, auditorPubKey, BigInt(Number(editSalary)), contractAddress);
            await account.execute([{
              contractAddress,
              entrypoint: 'set_audit_salary',
              calldata: [
                editIndex.toString(),
                auditEnc.cipher0.toString(), auditEnc.cipher1.toString(),
                auditEnc.cipher2.toString(), auditEnc.cipher3.toString(),
                auditEnc.nonceLow.toString(), auditEnc.nonceHigh.toString(),
              ],
            }]);
          }
        } catch (auditErr) {
          console.warn('Failed to update audit salary:', auditErr);
        }
      }
    } catch (err: unknown) {
      toastTxError('Update failed', err);
    } finally {
      setEditSaving(false);
    }
  };

  const handleRegister = async () => {
    if (!tongoAddress || !address) return;
    setSubmitting(true);
    setTxStatus(null);
    try {
      let pubkeyX: string, pubkeyY: string;
      try {
        const affine = pubKeyBase58ToAffine(tongoAddress);
        pubkeyX = toHex(affine.x);
        pubkeyY = toHex(affine.y);
      } catch {
        setTxStatus('Error: Invalid Tongo address.');
        setSubmitting(false);
        return;
      }
      let encrypted: EncryptedSalary | undefined;
      const salaryAmount = Number(salaryInput);
      if (salaryInput.trim() !== '' && (!Number.isFinite(salaryAmount) || salaryAmount <= 0 || !Number.isInteger(salaryAmount))) {
        setTxStatus('Error: Salary must be a positive whole number.');
        setSubmitting(false);
        return;
      }
      if (salaryAmount > 0) {
        const privateKey = loadTongoKey();
        if (!privateKey) { setTxStatus('Error: No Tongo key found.'); setSubmitting(false); return; }
        if (salaryAmount >= 2 ** 32) { setTxStatus('Error: Salary too large.'); setSubmitting(false); return; }
        encrypted = await encryptSalary(privateKey, { x: pubkeyX, y: pubkeyY }, BigInt(salaryAmount), contractAddress);
      }
      const call = buildRegisterCall(pubkeyX, pubkeyY, encrypted);
      if (!account) throw new Error('Wallet not connected');
      const tx = await account.execute([call]);
      setTxStatus(`Registered! Tx: ${tx.transaction_hash.slice(0, 20)}...`);
      toastTxSuccess('Employee registered', tx.transaction_hash);
      setTongoAddress('');
      setSalaryInput('');
      waitForTx(provider, tx.transaction_hash).then(() => fetchEmployees()).catch(console.error);

      // Encrypt audit salary copy if auditor is set
      if (encrypted && auditorPubKey) {
        try {
          const auditPrivateKey = loadTongoKey();
          if (auditPrivateKey) {
            const auditEncrypted = await encryptSalary(auditPrivateKey, auditorPubKey, BigInt(salaryAmount), contractAddress);
            const empCount = employees.length + 1;
            await account.execute([{
              contractAddress,
              entrypoint: 'set_audit_salary',
              calldata: [
                empCount.toString(),
                auditEncrypted.cipher0.toString(), auditEncrypted.cipher1.toString(),
                auditEncrypted.cipher2.toString(), auditEncrypted.cipher3.toString(),
                auditEncrypted.nonceLow.toString(), auditEncrypted.nonceHigh.toString(),
              ],
            }]);
          }
        } catch (auditErr) {
          console.warn('Failed to set audit salary:', auditErr);
        }
      }
    } catch (err: unknown) {
      setTxStatus(`Error: ${getErrorMessage(err)}`);
      toastTxError('Registration failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (index: number) => {
    if (!address || !account) return;
    setSubmitting(true);
    try {
      const tx = await account.execute([buildDeactivateCall(index)]);
      toastTxSuccess('Employee deactivated', tx.transaction_hash);
      waitForTx(provider, tx.transaction_hash).then(() => fetchEmployees()).catch(console.error);
    } catch (err: unknown) {
      toastTxError('Deactivation failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReactivate = async (index: number) => {
    if (!address || !account) return;
    setSubmitting(true);
    try {
      const tx = await account.execute([buildReactivateCall(index)]);
      toastTxSuccess('Employee reactivated', tx.transaction_hash);
      waitForTx(provider, tx.transaction_hash).then(() => fetchEmployees()).catch(console.error);
    } catch (err: unknown) {
      toastTxError('Reactivation failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  const editingEmp = editIndex !== null ? employees.find(e => e.index === editIndex) : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold font-serif text-[var(--fg)] mb-8 text-balance">Employee Registry</h1>

      {status !== 'connected' && (
        <div className="p-6 border border-dashed border-[var(--border)] rounded-xl text-center mb-8">
          <p className="text-[var(--fg-muted)] text-pretty">Connect wallet from the header to manage employees</p>
        </div>
      )}

      {address && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Register Employee</CardTitle>
            <p className="text-sm text-[var(--fg-muted)] text-pretty">
              Enter the employee's Tongo address (base58) and salary amount
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 mb-4">
              <Input type="text" placeholder="Tongo Address (base58)" value={tongoAddress} onChange={(e) => setTongoAddress(e.target.value)} />
              <div>
                <Input type="number" min="0" placeholder="Salary (whole token units)" value={salaryInput} onChange={(e) => setSalaryInput(e.target.value)} />
                <p className="text-xs text-[var(--fg-faint)] mt-1">
                  Salary is encrypted on-chain using ECDH. Value must be a whole number less than 4,294,967,296.
                </p>
              </div>
            </div>
            <Button onClick={handleRegister} disabled={!tongoAddress || submitting}>
              {submitting ? 'Encrypting & Submitting...' : 'Register On-Chain'}
            </Button>
          </CardContent>
        </Card>
      )}

      {txStatus && (
        <Alert variant="info" className="mb-6"><AlertDescription>{txStatus}</AlertDescription></Alert>
      )}

      <Card>
        <div className="flex items-center justify-between px-6 py-3 bg-[var(--bg-elevated)] rounded-t-2xl">
          <span className="text-sm text-[var(--fg-muted)]">{employees.length} employees on-chain</span>
          <Button variant="ghost" size="sm" onClick={fetchEmployees} disabled={loading} className="text-[var(--brand)] hover:text-[var(--brand-hover)]" aria-label="Refresh employee list">
            {loading ? 'Loading...' : '\u21BB Refresh'}
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Tongo Address</TableHead>
              <TableHead className="text-right">Salary ({symbol})</TableHead>
              <TableHead>Cadence</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((emp) => (
              <TableRow key={emp.index}>
                <TableCell className="text-[var(--fg)]">{emp.index}</TableCell>
                <TableCell className="font-mono text-xs text-[var(--fg-muted)]">
                  <span className="inline-flex items-center gap-1">
                    {tongoAddresses[emp.index]
                      ? `${tongoAddresses[emp.index].slice(0, 8)}...${tongoAddresses[emp.index].slice(-6)}`
                      : `${emp.pubkeyX.slice(0, 10)}...`}
                    {tongoAddresses[emp.index] && <CopyButton text={tongoAddresses[emp.index]} />}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {decryptedSalaries[emp.index] !== undefined ? (
                    <span className="text-[var(--alert-ok-fg)] font-medium">{decryptedSalaries[emp.index].toString()}</span>
                  ) : emp.encryptedSalary && !isEmptySalary(emp.encryptedSalary) ? (
                    <span className="text-[var(--fg-faint)] italic">encrypted</span>
                  ) : (
                    <span className="text-[var(--fg-faint)]">--</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-[var(--fg-muted)]">
                  {CADENCE_LABELS[emp.cadence || 1] || 'Monthly'}
                </TableCell>
                <TableCell>
                  <Badge variant={emp.isActive ? 'active' : 'inactive'}>
                    {emp.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {emp.isActive && address && (
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(emp.index)} className="text-[var(--brand)] hover:text-[var(--brand-hover)]">
                        Edit
                      </Button>
                    )}
                    {emp.isActive && address && (
                      <Button variant="ghost" size="sm" onClick={() => handleDeactivate(emp.index)} disabled={submitting} className="text-red-600 hover:text-red-700">
                        Deactivate
                      </Button>
                    )}
                    {!emp.isActive && address && (
                      <Button variant="ghost" size="sm" onClick={() => handleReactivate(emp.index)} disabled={submitting} className="text-[var(--brand)] hover:text-[var(--brand-hover)]">
                        Reactivate
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {employees.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-[var(--fg-faint)] py-8">No employees registered yet</TableCell>
              </TableRow>
            )}
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-[var(--fg-faint)] py-8">Loading from chain...</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Edit Employee Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Employee #{editIndex}</DialogTitle>
          </DialogHeader>
          {editingEmp && (
            <div className="space-y-5 mt-4">
              <div className="text-xs font-mono text-[var(--fg-faint)] bg-[var(--bg-elevated)] px-3 py-2 rounded-lg">
                {tongoAddresses[editingEmp.index] || `${editingEmp.pubkeyX.slice(0, 16)}...`}
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--fg)] mb-1.5">Salary ({symbol})</label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Whole token units"
                  value={editSalary}
                  onChange={(e) => setEditSalary(e.target.value)}
                />
                <p className="text-xs text-[var(--fg-faint)] mt-1">Encrypted on-chain. Must be a whole number.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--fg)] mb-1.5">Payroll Cadence</label>
                <div className="flex gap-2">
                  {[
                    { value: '1', label: 'Monthly' },
                    { value: '2', label: 'Semi-monthly' },
                    { value: '3', label: 'Weekly' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setEditCadence(opt.value)}
                      aria-label={`Select ${opt.label} cadence`}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        editCadence === opt.value
                          ? 'bg-[var(--fg)] text-[var(--bg)]'
                          : 'bg-[var(--bg-elevated)] text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button onClick={handleEditSave} disabled={editSaving}>
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
