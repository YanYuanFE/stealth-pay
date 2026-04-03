import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useProvider } from '@starknet-react/core';
import { usePayrollContract } from '../../hooks/usePayrollContract';
import { CopyButton } from '../../components/CopyButton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

function formatTs(ts: number): string {
  if (!ts) return '--';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function EmployerHistory() {
  const { address } = useAccount();
  const { provider } = useProvider();
  const { runCount, payrollRuns, loading, fetchEmployees } = usePayrollContract(provider, address);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  return (
    <div>
      <h1 className="text-2xl font-semibold font-serif text-[var(--fg)] mb-8 text-balance">Payroll History</h1>

      <Card className="mb-6">
        <CardContent className="p-6">
          <p className="text-sm text-[var(--fg-muted)] text-pretty">Total Payroll Runs On-Chain</p>
          <p className="text-3xl font-bold text-[var(--fg)] tabular-nums">{loading ? '...' : runCount}</p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Employees</TableHead>
              <TableHead>Run ID</TableHead>
              <TableHead>Commitment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payrollRuns.length > 0 ? (
              [...payrollRuns].reverse().map((run) => (
                <TableRow key={run.runId}>
                  <TableCell className="tabular-nums">{run.index}</TableCell>
                  <TableCell className="text-[var(--fg-muted)]">{formatTs(run.timestamp)}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.employeeCount}</TableCell>
                  <TableCell className="font-mono text-xs text-[var(--fg-muted)]">
                    <span className="inline-flex items-center gap-1">
                      {run.runId.slice(0, 10)}...
                      <CopyButton text={run.runId} />
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[var(--fg-muted)]">
                    <span className="inline-flex items-center gap-1">
                      {run.commitment.slice(0, 10)}...
                      <CopyButton text={run.commitment} />
                    </span>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-[var(--fg-faint)] py-8">
                  {loading ? (
                    'Loading from chain...'
                  ) : (
                    <div className="space-y-3">
                      <p className="text-pretty">No payroll runs yet</p>
                      <Button asChild>
                        <Link to="/employer/payroll">Run Your First Payroll</Link>
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
