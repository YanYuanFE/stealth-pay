import { useState, useCallback, useEffect, useRef } from 'react';
import { Contract } from 'starknet';
import type { ProviderInterface, Call } from 'starknet';
import payrollAbi from '../abi/payroll_manager.json';
import factoryAbi from '../abi/payroll_factory.json';
import { PAYROLL_FACTORY, TONGO_CONTRACTS, DEFAULT_NETWORK } from '../config/contracts';
import type { Employee } from '../store/usePayrollStore';
import { parseEncryptedSalary } from '../lib/salary-crypto';
import type { EncryptedSalary } from '../lib/salary-crypto';
import { toHex, tupleToPubKey } from '../lib/utils';

const FACTORY_ADDRESS = PAYROLL_FACTORY[DEFAULT_NETWORK];

export function usePayrollContract(provider: ProviderInterface | null, walletAddress?: string) {
  const [PAYROLL_ADDRESS, setPayrollAddress] = useState('');
  const resolvedRef = useRef(false);
  const [contract, setContract] = useState<Contract | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [runCount, setRunCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [employerPubKey, setEmployerPubKey] = useState<{ x: string; y: string } | null>(null);
  const [tongoContract, setTongoContract] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [payrollRuns, setPayrollRuns] = useState<{ index: number; runId: string; timestamp: number; employeeCount: number; commitment: string }[]>([]);

  // Resolve payroll address from factory
  useEffect(() => {
    if (!provider || !walletAddress || resolvedRef.current) return;
    const resolve = async () => {
      try {
        const factory = new Contract({ abi: factoryAbi, address: FACTORY_ADDRESS, providerOrAccount: provider });
        const result = await factory.get_company(walletAddress);
        const val = BigInt(result);
        if (val !== 0n) {
          setPayrollAddress(toHex(val));
          resolvedRef.current = true;
          return;
        }
      } catch (err) {
        console.error('Failed to resolve company from factory:', err);
      }
      resolvedRef.current = true;
    };
    resolve();
  }, [provider, walletAddress]);

  // Initialize contract
  useEffect(() => {
    if (!provider || !PAYROLL_ADDRESS) return;
    const c = new Contract({ abi: payrollAbi, address: PAYROLL_ADDRESS, providerOrAccount: provider });
    setContract(c);
  }, [provider, PAYROLL_ADDRESS]);

  // Fetch all employees from chain
  const fetchEmployees = useCallback(async () => {
    if (!contract) return;
    setLoading(true);
    try {
      const countResult = await contract.get_employee_count();
      const count = Number(countResult ?? 0);
      if (!Number.isFinite(count) || count < 0) {
        setEmployees([]);
        return;
      }

      // Fetch all employees in parallel
      const employeePromises = Array.from({ length: count }, (_, i) =>
        contract.get_employee(i + 1).catch(() => null)
      );
      const employeeResults = await Promise.all(employeePromises);

      const emps: Employee[] = [];
      for (let i = 0; i < employeeResults.length; i++) {
        const result = employeeResults[i];
        if (!result) continue;
        // Handle both array and struct formats
        let pubkeyX: bigint, pubkeyY: bigint, isActive: boolean;
        if (Array.isArray(result) && result.length >= 3) {
          pubkeyX = BigInt(result[0]);
          pubkeyY = BigInt(result[1]);
          isActive = result[2] === true || result[2] === 1n || result[2] === 1;
        } else if (typeof result === 'object') {
          const r = result as Record<string, unknown>;
          const vals = Object.values(r);
          if (vals.length < 3) continue;
          pubkeyX = BigInt(vals[0] as string | number | bigint);
          pubkeyY = BigInt(vals[1] as string | number | bigint);
          isActive = vals[2] === true || vals[2] === 1n || vals[2] === 1;
        } else continue;
        if (pubkeyX === 0n && pubkeyY === 0n) continue;
        emps.push({
          index: i + 1,
          pubkeyX: toHex(pubkeyX),
          pubkeyY: toHex(pubkeyY),
          isActive,
        });
      }

      // Fetch all salaries in parallel
      const salaryPromises = emps.map(emp =>
        contract.get_salary(emp.index).catch(() => null)
      );
      const salaryResults = await Promise.all(salaryPromises);

      for (let i = 0; i < emps.length; i++) {
        const salaryResult = salaryResults[i];
        if (!salaryResult) continue;
        // Handle both array and struct formats
        if (Array.isArray(salaryResult) && salaryResult.length >= 6) {
          emps[i].encryptedSalary = parseEncryptedSalary(salaryResult);
        } else if (typeof salaryResult === 'object') {
          // Struct format: try common field names
          const s = salaryResult as Record<string, unknown>;
          const fields = Object.values(s);
          if (fields.length >= 6) {
            emps[i].encryptedSalary = parseEncryptedSalary(fields);
          }
        }
      }

      // Fetch cadences in parallel
      const cadencePromises = emps.map(emp =>
        contract.get_cadence(emp.index).catch(() => null)
      );
      const cadenceResults = await Promise.all(cadencePromises);
      for (let i = 0; i < emps.length; i++) {
        const cadence = cadenceResults[i];
        if (cadence !== null) {
          emps[i].cadence = Number(cadence);
        }
      }

      setEmployees(emps);

      // Fetch employer pubkey
      try {
        const epk = await contract.get_employer_pubkey();
        if (epk && epk.length >= 2) {
          setEmployerPubKey(tupleToPubKey(epk));
        }
      } catch {
        // May not be set yet
      }

      // Fetch tongo contract + token symbol
      try {
        const tongoAddr = await contract.get_tongo_contract();
        const tongoHex = toHex(tongoAddr);
        setTongoContract(tongoHex);
        const contracts = TONGO_CONTRACTS[DEFAULT_NETWORK] as Record<string, string>;
        for (const [sym, addr] of Object.entries(contracts)) {
          if (BigInt(addr) === BigInt(tongoAddr)) { setTokenSymbol(sym); break; }
        }
      } catch { /* ignore */ }

      try {
        const name = await contract.get_company_name();
        setCompanyName(typeof name === 'string' ? name : String(name));
      } catch { /* ignore */ }

      try {
        const rc = await contract.get_run_count();
        const count = Number(rc ?? 0);
        setRunCount(count);

        // Fetch all payroll runs in parallel
        if (count > 0) {
          const runIdPromises = Array.from({ length: count }, (_, i) =>
            contract.get_run_id_at(i + 1).catch(() => null)
          );
          const runIds = await Promise.all(runIdPromises);

          const runs: typeof payrollRuns = [];
          const detailPromises = runIds.map(async (rid, i) => {
            if (!rid) return null;
            const id = toHex(rid);
            const [ts, ec, cm] = await Promise.all([
              contract.get_run_timestamp(rid).catch(() => 0n),
              contract.get_run_employee_count(rid).catch(() => 0),
              contract.get_run_commitment(rid).catch(() => 0n),
            ]);
            return {
              index: i + 1,
              runId: id,
              timestamp: Number(ts),
              employeeCount: Number(ec),
              commitment: toHex(cm),
            };
          });
          const results = await Promise.all(detailPromises);
          for (const r of results) {
            if (r) runs.push(r);
          }
          setPayrollRuns(runs);
        } else {
          setPayrollRuns([]);
        }
      } catch { /* ignore */ }
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    } finally {
      setLoading(false);
    }
  }, [contract]);

  // Build register_employee call (with encrypted salary)
  const buildRegisterCall = useCallback((
    pubkeyX: string,
    pubkeyY: string,
    encrypted?: EncryptedSalary,
  ): Call => {
    const calldata = [pubkeyX, pubkeyY];
    if (encrypted) {
      calldata.push(
        encrypted.cipher0.toString(),
        encrypted.cipher1.toString(),
        encrypted.cipher2.toString(),
        encrypted.cipher3.toString(),
        encrypted.nonceLow.toString(),
        encrypted.nonceHigh.toString(),
      );
    } else {
      // Pass zeros if no salary encrypted
      calldata.push('0', '0', '0', '0', '0', '0');
    }
    return {
      contractAddress: PAYROLL_ADDRESS,
      entrypoint: 'register_employee',
      calldata,
    };
  }, [PAYROLL_ADDRESS]);

  // Build deactivate_employee call
  const buildDeactivateCall = useCallback((index: number): Call => {
    return {
      contractAddress: PAYROLL_ADDRESS,
      entrypoint: 'deactivate_employee',
      calldata: [index.toString()],
    };
  }, [PAYROLL_ADDRESS]);

  // Build set_cadence call
  const buildSetCadenceCall = useCallback((index: number, cadence: number): Call => {
    return {
      contractAddress: PAYROLL_ADDRESS,
      entrypoint: 'set_cadence',
      calldata: [index.toString(), cadence.toString()],
    };
  }, [PAYROLL_ADDRESS]);

  // Build reactivate_employee call
  const buildReactivateCall = useCallback((index: number): Call => ({
    contractAddress: PAYROLL_ADDRESS,
    entrypoint: 'reactivate_employee',
    calldata: [index.toString()],
  }), [PAYROLL_ADDRESS]);

  // Build record_payroll_run call
  const buildRecordRunCall = useCallback((runId: string, employeeCount: number, commitment: string): Call => {
    return {
      contractAddress: PAYROLL_ADDRESS,
      entrypoint: 'record_payroll_run',
      calldata: [runId, employeeCount.toString(), commitment],
    };
  }, [PAYROLL_ADDRESS]);

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
    contractAddress: PAYROLL_ADDRESS,
    employerPubKey,
    tongoContract,
    tokenSymbol,
    payrollRuns,
  };
}
