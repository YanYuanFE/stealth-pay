import { useState, useEffect } from 'react';
import { useProvider } from '@starknet-react/core';
import { Contract } from 'starknet';
import { pubKeyAffineToBase58, derivePublicKey } from '@fatsolutions/tongo-sdk';
import payrollAbi from '../../abi/payroll_manager.json';
import { loadTongoKey } from '../../lib/crypto';
import { decryptSalary, parseEncryptedSalary, isEmptySalary } from '../../lib/salary-crypto';
import { toHex, tupleToPubKey } from '../../lib/utils';
import { CopyButton } from '../../components/CopyButton';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';

export default function AuditorPortal() {
  const { provider } = useProvider();
  const [contractAddr, setContractAddr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [employees, setEmployees] = useState<{
    index: number;
    address: string;
    active: boolean;
    salary: bigint | null;
    cadence: number;
  }[]>([]);

  // Check if Tongo key exists in localStorage
  useEffect(() => {
    setHasKey(loadTongoKey() !== null);
  }, []);

  const handleAudit = async () => {
    if (!contractAddr || !provider) return;
    setLoading(true);
    setError(null);
    setEmployees([]);
    setCompanyName('');

    try {
      const auditorPrivateKey = loadTongoKey();
      if (!auditorPrivateKey) {
        setError('No Tongo key found. Go to Setup to generate or import one.');
        setLoading(false);
        return;
      }

      const contract = new Contract({ abi: payrollAbi, address: contractAddr, providerOrAccount: provider });

      // Read on-chain auditor public key
      const auditorPkResult = await contract.get_auditor();
      const auditorPkVals = Object.values(auditorPkResult);
      const onChainX = BigInt(auditorPkVals[0] as string | number | bigint);
      const onChainY = BigInt(auditorPkVals[1] as string | number | bigint);

      if (onChainX === 0n && onChainY === 0n) {
        setError('No auditor is configured for this company.');
        setLoading(false);
        return;
      }

      // Derive public key from our private key and verify it matches
      const myPubKey = derivePublicKey(auditorPrivateKey);
      if (BigInt(myPubKey.x) !== onChainX || BigInt(myPubKey.y) !== onChainY) {
        setError('Your Tongo key does not match the auditor registered for this company.');
        setLoading(false);
        return;
      }

      // Read company name
      try {
        const name = await contract.get_company_name();
        setCompanyName(typeof name === 'string' ? name : String(name));
      } catch { setCompanyName('Unknown'); }

      // Read employer pubkey (needed for ECDH decryption)
      const epk = await contract.get_employer_pubkey();
      const employerPk = tupleToPubKey(Object.values(epk));

      // Read all employees in parallel
      const count = Number(await contract.get_employee_count());
      const emps: typeof employees = [];

      for (let i = 1; i <= count; i++) {
        try {
          const empResult = await contract.get_employee(i);
          const vals = Object.values(empResult);
          const pubX = BigInt(vals[0] as string | number | bigint);
          const pubY = BigInt(vals[1] as string | number | bigint);
          const isActive = vals[2] === true || vals[2] === 1n || vals[2] === 1;

          let addr = '';
          try { addr = pubKeyAffineToBase58({ x: pubX, y: pubY }); } catch { addr = toHex(pubX).slice(0, 12) + '...'; }

          // Decrypt audit salary
          let salary: bigint | null = null;
          try {
            const auditResult = await contract.get_audit_salary(i);
            const auditVals = Object.values(auditResult);
            if (auditVals.length >= 6) {
              const encrypted = parseEncryptedSalary(auditVals);
              if (!isEmptySalary(encrypted)) {
                salary = await decryptSalary(auditorPrivateKey, employerPk, encrypted, contractAddr);
              }
            }
          } catch { /* no audit data or decryption failed */ }

          let cadence = 1;
          try { cadence = Number(await contract.get_cadence(i)); } catch { /* default */ }

          emps.push({ index: i, address: addr, active: isActive, salary, cadence });
        } catch { /* skip */ }
      }

      setEmployees(emps);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audit failed');
    } finally {
      setLoading(false);
    }
  };

  const cadenceLabel: Record<number, string> = { 1: 'Monthly', 2: 'Semi-monthly', 3: 'Weekly' };

  return (
    <div>
      <h1 className="text-2xl font-semibold font-serif text-[var(--fg)] mb-8 text-balance">Auditor Portal</h1>

      {!hasKey ? (
        <Alert variant="warning" className="mb-8">
          <AlertDescription>
            <p className="font-medium mb-1">No Tongo key found</p>
            <p className="text-sm mb-3">
              You need a Tongo keypair to audit. Generate or import one first — then share your Tongo address with the employer so they can register you as auditor.
            </p>
            <Link to="/employee/setup" className="text-sm font-medium text-[var(--brand)] hover:text-[var(--brand-hover)] underline">
              Go to Key Setup
            </Link>
          </AlertDescription>
        </Alert>
      ) : (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Audit a Company</CardTitle>
            <p className="text-sm text-[var(--fg-muted)] text-pretty">
              Enter the company's payroll contract address. Your Tongo key will be used automatically to verify your auditor role and decrypt salary data.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                type="text"
                placeholder="Company contract address (0x...)"
                value={contractAddr}
                onChange={(e) => setContractAddr(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleAudit} disabled={!contractAddr || loading}>
                {loading ? 'Auditing...' : 'Audit'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {companyName && (
        <>
          <Alert variant="info" className="mb-6">
            <AlertDescription>
              <span className="font-medium">Auditing: {companyName}</span> — {employees.length} employees found
            </AlertDescription>
          </Alert>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Tongo Address</TableHead>
                  <TableHead className="text-right">Salary</TableHead>
                  <TableHead>Cadence</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp) => (
                  <TableRow key={emp.index}>
                    <TableCell>{emp.index}</TableCell>
                    <TableCell className="font-mono text-xs text-[var(--fg-muted)]">
                      <span className="inline-flex items-center gap-1">
                        {emp.address.slice(0, 8)}...{emp.address.slice(-6)}
                        <CopyButton text={emp.address} />
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono">
                      {emp.salary !== null ? (
                        <span className="text-green-700 font-medium">{emp.salary.toString()}</span>
                      ) : (
                        <span className="text-[var(--fg-faint)] italic">no audit data</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-[var(--fg-muted)]">
                      {cadenceLabel[emp.cadence] || 'Monthly'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={emp.active ? 'active' : 'inactive'}>
                        {emp.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {employees.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-[var(--fg-faint)] py-8">
                      Enter a contract address above to start auditing
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
