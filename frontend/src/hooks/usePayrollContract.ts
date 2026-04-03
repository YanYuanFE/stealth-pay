import { useMemo, useCallback } from 'react';
import { Contract } from 'starknet';
import type { ProviderInterface, Call } from 'starknet';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import payrollAbi from '../abi/payroll_manager.json';
import factoryAbi from '../abi/payroll_factory.json';
import { PAYROLL_FACTORY, TONGO_CONTRACTS, DEFAULT_NETWORK } from '../config/contracts';
import type { Employee } from '../store/usePayrollStore';
import { parseEncryptedSalary } from '../lib/salary-crypto';
import type { EncryptedSalary } from '../lib/salary-crypto';
import { toHex, tupleToPubKey } from '../lib/utils';

const FACTORY_ADDRESS = PAYROLL_FACTORY[DEFAULT_NETWORK];

// ── Fetch payroll address from factory ──
async function resolvePayrollAddress(provider: ProviderInterface, walletAddress: string): Promise<string> {
  const factory = new Contract({ abi: factoryAbi, address: FACTORY_ADDRESS, providerOrAccount: provider });
  const result = await factory.get_company(walletAddress);
  const val = BigInt(result);
  return val !== 0n ? toHex(val) : '';
}

// ── Fetch all company data from chain ──
async function fetchCompanyData(contract: Contract) {
  const countResult = await contract.get_employee_count();
  const count = Number(countResult ?? 0);
  if (!Number.isFinite(count) || count < 0) return { employees: [], companyName: '', runCount: 0, employerPubKey: null, tongoContract: '', tokenSymbol: '', payrollRuns: [] };

  // Employees
  const employeeResults = await Promise.all(
    Array.from({ length: count }, (_, i) => contract.get_employee(i + 1).catch(() => null))
  );

  const emps: Employee[] = [];
  for (let i = 0; i < employeeResults.length; i++) {
    const result = employeeResults[i];
    if (!result) continue;
    let pubkeyX: bigint, pubkeyY: bigint, isActive: boolean;
    if (Array.isArray(result) && result.length >= 3) {
      pubkeyX = BigInt(result[0]); pubkeyY = BigInt(result[1]);
      isActive = result[2] === true || result[2] === 1n || result[2] === 1;
    } else if (typeof result === 'object') {
      const vals = Object.values(result as Record<string, unknown>);
      if (vals.length < 3) continue;
      pubkeyX = BigInt(vals[0] as string | number | bigint);
      pubkeyY = BigInt(vals[1] as string | number | bigint);
      isActive = vals[2] === true || vals[2] === 1n || vals[2] === 1;
    } else continue;
    if (pubkeyX === 0n && pubkeyY === 0n) continue;
    emps.push({ index: i + 1, pubkeyX: toHex(pubkeyX), pubkeyY: toHex(pubkeyY), isActive });
  }

  // Salaries
  const salaryResults = await Promise.all(emps.map(emp => contract.get_salary(emp.index).catch(() => null)));
  for (let i = 0; i < emps.length; i++) {
    const sr = salaryResults[i];
    if (!sr) continue;
    if (Array.isArray(sr) && sr.length >= 6) {
      emps[i].encryptedSalary = parseEncryptedSalary(sr);
    } else if (typeof sr === 'object') {
      const fields = Object.values(sr as Record<string, unknown>);
      if (fields.length >= 6) emps[i].encryptedSalary = parseEncryptedSalary(fields);
    }
  }

  // Cadences
  const cadenceResults = await Promise.all(emps.map(emp => contract.get_cadence(emp.index).catch(() => null)));
  for (let i = 0; i < emps.length; i++) {
    if (cadenceResults[i] !== null) emps[i].cadence = Number(cadenceResults[i]);
  }

  // Employer pubkey
  let employerPubKey: { x: string; y: string } | null = null;
  try {
    const epk = await contract.get_employer_pubkey();
    if (epk && (Array.isArray(epk) ? epk.length >= 2 : Object.keys(epk).length >= 2)) {
      employerPubKey = tupleToPubKey(Array.isArray(epk) ? epk : Object.values(epk));
    }
  } catch { /* ignore */ }

  // Tongo contract + token
  let tongoContract = '', tokenSymbol = '';
  try {
    const tongoAddr = await contract.get_tongo_contract();
    tongoContract = toHex(tongoAddr);
    const contracts = TONGO_CONTRACTS[DEFAULT_NETWORK] as Record<string, string>;
    for (const [sym, addr] of Object.entries(contracts)) {
      if (BigInt(addr) === BigInt(tongoAddr)) { tokenSymbol = sym; break; }
    }
  } catch { /* ignore */ }

  // Company name
  let companyName = '';
  try {
    const name = await contract.get_company_name();
    companyName = typeof name === 'string' ? name : String(name);
  } catch { /* ignore */ }

  // Payroll runs
  let runCount = 0;
  const payrollRuns: { index: number; runId: string; timestamp: number; employeeCount: number; commitment: string }[] = [];
  try {
    const rc = await contract.get_run_count();
    runCount = Number(rc ?? 0);
    if (runCount > 0) {
      const runIds = await Promise.all(
        Array.from({ length: runCount }, (_, i) => contract.get_run_id_at(i + 1).catch(() => null))
      );
      const details = await Promise.all(runIds.map(async (rid, i) => {
        if (!rid) return null;
        const id = toHex(rid);
        const [ts, ec, cm] = await Promise.all([
          contract.get_run_timestamp(rid).catch(() => 0n),
          contract.get_run_employee_count(rid).catch(() => 0),
          contract.get_run_commitment(rid).catch(() => 0n),
        ]);
        return { index: i + 1, runId: id, timestamp: Number(ts), employeeCount: Number(ec), commitment: toHex(cm) };
      }));
      for (const r of details) { if (r) payrollRuns.push(r); }
    }
  } catch { /* ignore */ }

  return { employees: emps, companyName, runCount, employerPubKey, tongoContract, tokenSymbol, payrollRuns };
}

// ── Main hook ──
export function usePayrollContract(provider: ProviderInterface | null, walletAddress?: string) {
  const queryClient = useQueryClient();

  // Resolve payroll address
  const { data: payrollAddress = '' } = useQuery({
    queryKey: ['payroll-address', walletAddress],
    queryFn: () => resolvePayrollAddress(provider!, walletAddress!),
    enabled: !!provider && !!walletAddress,
    staleTime: 60_000,
  });

  // Create contract instance
  const contract = useMemo(() => {
    if (!provider || !payrollAddress) return null;
    return new Contract({ abi: payrollAbi, address: payrollAddress, providerOrAccount: provider });
  }, [provider, payrollAddress]);

  // Fetch all company data
  const { data, isLoading: loading } = useQuery({
    queryKey: ['company-data', payrollAddress],
    queryFn: () => fetchCompanyData(contract!),
    enabled: !!contract,
    staleTime: 15_000,
  });

  const employees = data?.employees ?? [];
  const companyName = data?.companyName ?? '';
  const runCount = data?.runCount ?? 0;
  const employerPubKey = data?.employerPubKey ?? null;
  const tongoContract = data?.tongoContract ?? '';
  const tokenSymbol = data?.tokenSymbol ?? '';
  const payrollRuns = data?.payrollRuns ?? [];

  // Invalidate to refetch
  const fetchEmployees = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['company-data', payrollAddress] });
  }, [queryClient, payrollAddress]);

  // ── Call builders ──
  const buildRegisterCall = useCallback((pubkeyX: string, pubkeyY: string, encrypted?: EncryptedSalary): Call => {
    const calldata = [pubkeyX, pubkeyY];
    if (encrypted) {
      calldata.push(
        encrypted.cipher0.toString(), encrypted.cipher1.toString(),
        encrypted.cipher2.toString(), encrypted.cipher3.toString(),
        encrypted.nonceLow.toString(), encrypted.nonceHigh.toString(),
      );
    } else {
      calldata.push('0', '0', '0', '0', '0', '0');
    }
    return { contractAddress: payrollAddress, entrypoint: 'register_employee', calldata };
  }, [payrollAddress]);

  const buildDeactivateCall = useCallback((index: number): Call => ({
    contractAddress: payrollAddress, entrypoint: 'deactivate_employee', calldata: [index.toString()],
  }), [payrollAddress]);

  const buildSetCadenceCall = useCallback((index: number, cadence: number): Call => ({
    contractAddress: payrollAddress, entrypoint: 'set_cadence', calldata: [index.toString(), cadence.toString()],
  }), [payrollAddress]);

  const buildReactivateCall = useCallback((index: number): Call => ({
    contractAddress: payrollAddress, entrypoint: 'reactivate_employee', calldata: [index.toString()],
  }), [payrollAddress]);

  const buildRecordRunCall = useCallback((runId: string, employeeCount: number, commitment: string): Call => ({
    contractAddress: payrollAddress, entrypoint: 'record_payroll_run', calldata: [runId, employeeCount.toString(), commitment],
  }), [payrollAddress]);

  return {
    contract,
    employees,
    companyName,
    runCount,
    loading,
    fetchEmployees,
    buildRegisterCall,
    buildDeactivateCall,
    buildSetCadenceCall,
    buildReactivateCall,
    buildRecordRunCall,
    contractAddress: payrollAddress,
    employerPubKey,
    tongoContract,
    tokenSymbol,
    payrollRuns,
  };
}
