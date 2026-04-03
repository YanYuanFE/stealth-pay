import { create } from 'zustand';
import type { EncryptedSalary } from '../lib/salary-crypto';

export interface Employee {
  index: number;
  pubkeyX: string;
  pubkeyY: string;
  isActive: boolean;
  salary?: bigint;
  cadence?: number;
  encryptedSalary?: EncryptedSalary;
}

interface PayrollState {
  employees: Employee[];
  isProcessing: boolean;
  setEmployees: (employees: Employee[]) => void;
  addEmployee: (employee: Employee) => void;
  removeEmployee: (index: number) => void;
  setProcessing: (processing: boolean) => void;
}

export const usePayrollStore = create<PayrollState>((set) => ({
  employees: [],
  isProcessing: false,
  setEmployees: (employees) => set({ employees }),
  addEmployee: (employee) =>
    set((state) => ({ employees: [...state.employees, employee] })),
  removeEmployee: (index) =>
    set((state) => ({
      employees: state.employees.filter((e) => e.index !== index),
    })),
  setProcessing: (processing) => set({ isProcessing: processing }),
}));
