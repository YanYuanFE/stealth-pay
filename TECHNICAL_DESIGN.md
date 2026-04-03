# StealthPay — Confidential Payroll on Starknet

## Technical Design Document

---

## 1. Project Overview

### 1.1 What

StealthPay is a confidential, non-custodial payroll protocol on Starknet. Employers can pay employees in any ERC-20 token (USDC, ETH, WBTC, etc.) with **salary amounts fully encrypted on-chain**. Only the employee can decrypt their own salary; an optional auditor can access all records for compliance.

### 1.2 Why

On-chain payroll today is fully transparent — anyone can see who gets paid how much. This creates:
- Privacy violations (employees see each other's salaries)
- Competitive intelligence leaks (competitors see compensation structure)
- GDPR/compliance concerns for EU-based companies

StealthPay solves this by leveraging Starknet's ZK infrastructure and the Tongo confidential transfer protocol.

### 1.3 Hackathon Context

- **Event**: PL_Genesis: Frontiers of Collaboration Hackathon
- **Track**: Starknet Bounty — "Privacy Innovation within the Bitcoin Ecosystem"
- **Prize**: $5,000 USD
- **Judging Criteria**:
  - Privacy Innovation (30%)
  - Technical Execution (25%)
  - Starknet Integration (20%)
  - Usability & Design (15%)
  - Potential Impact (10%)

---

## 2. Architecture

### 2.1 System Overview

```
┌─────────────────────────────────────────────────────┐
│                Frontend (Vite + React)                │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Employer     │  │ Employee     │  │ Auditor     │ │
│  │ Dashboard    │  │ Portal       │  │ View        │ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                │                  │        │
│  ┌──────▼────────────────▼──────────────────▼──────┐ │
│  │          StarkZap SDK + Tongo SDK               │ │
│  │  - Wallet connection (Argent/Braavos/Cartridge) │ │
│  │  - ZK proof generation (client-side)            │ │
│  │  - Confidential transfer operations             │ │
│  │  - Balance decryption (client-side)             │ │
│  └──────────────────────┬──────────────────────────┘ │
└─────────────────────────┼────────────────────────────┘
                          │ multicall
┌─────────────────────────▼────────────────────────────┐
│                   Starknet Network                    │
│                                                       │
│  ┌──────────────────────┐  ┌───────────────────────┐ │
│  │ PayrollManager.cairo  │  │ Tongo Contract        │ │
│  │                       │  │ (per-token instance)   │ │
│  │ - Employee registry   │  │                       │ │
│  │ - Payroll run records │  │ - fund()              │ │
│  │ - Access control      │  │ - transfer() ← 核心   │ │
│  │ - Batch coordination  │  │ - rollover()          │ │
│  │                       │  │ - withdraw()          │ │
│  └───────────────────────┘  │ - ragequit()          │ │
│                              └───────────┬──────────┘ │
│                              ┌───────────▼──────────┐ │
│                              │ ERC-20 Token Contract │ │
│                              │ (USDC, ETH, WBTC...) │ │
│                              └──────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

### 2.2 Design Principles

1. **Non-custodial**: The platform never holds employer funds or employee private keys
2. **Token-agnostic**: Any ERC-20 on Starknet — deploy a Tongo instance per token
3. **Privacy by default**: Salary amounts encrypted via ElGamal; only recipient + auditor can decrypt
4. **Minimal on-chain footprint**: PayrollManager stores only metadata (no salary values)
5. **Client-side ZK**: All ZK proofs generated in the browser via Tongo SDK

### 2.3 Privacy Model

| Data | Employer | Employee | Auditor | Public |
|------|----------|----------|---------|--------|
| Total budget deposited | Visible | — | Visible | Visible (fund event) |
| Individual salary amount | Knows (generates proof) | Decrypts own | Decrypts all | **Encrypted** |
| Employee Tongo PubKey | Visible | Own key | Visible | Visible (pseudonym) |
| Employee Starknet address | Visible | Own | Visible | Not linked on-chain |
| Payment timestamp | Visible | Visible | Visible | Visible |

**Key insight**: The `transfer()` event emits `CipherBalance` (ElGamal encrypted), not plaintext amounts. Decryption requires the recipient's Tongo private key or the auditor key.

---

## 3. Technology Stack

### 3.1 Smart Contracts

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | Cairo | 2.16.x (bundled with Scarb) |
| Package Manager | Scarb | 2.16.1 |
| Test Framework | Starknet Foundry (snforge) | 0.58.0 |
| Deploy Tool | sncast | 0.58.0 |
| Access Control | OpenZeppelin Cairo | 3.0.0 |
| Confidential Layer | Tongo contracts | Already deployed |

### 3.2 Frontend

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React | 19.x |
| Build Tool | Vite | 7.x |
| Starknet SDK | starkzap | 2.0.0 |
| Confidential SDK | @fatsolutions/tongo-sdk | 1.3.2 |
| Starknet Core | starknet.js | 9.x |
| Wallet Connection | starknet-react / StarknetKit | latest |
| Styling | Tailwind CSS | 4.x |
| State Management | Zustand | latest |
| Routing | React Router | 7.x |

### 3.3 Deployed Tongo Contracts (Sepolia Testnet)

| Token | Tongo Contract Address |
|-------|----------------------|
| STRK | `0x408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed` |
| ETH | `0x2cf0dc1d9e8c7731353dd15e6f2f22140120ef2d27116b982fa4fed87f6fef5` |
| USDC | `0x2caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552` |
| WBTC | `0x02b9f62f9be99590ad2505e9e89ca746c8fb67bdb6a4be2a1b9a1d867af7339e` |

### 3.4 Deployed Tongo Contracts (Mainnet)

| Token | Tongo Contract Address |
|-------|----------------------|
| WBTC | `0x6d82c8c467eac77f880a1d5a090e0e0094a557bf67d74b98ba1881200750e27` |
| USDC | `0x026f79017c3c382148832c6ae50c22502e66f7a2f81ccbdb9e1377af31859d3a` |
| USDT | `0x659c62ba8bc3ac92ace36ba190b350451d0c767aa973dd63b042b59cc065da0` |
| ETH | `0x276e11a5428f6de18a38b7abc1d60abc75ce20aa3a925e20a393fcec9104f89` |

---

## 4. Smart Contract Design

### 4.1 PayrollManager.cairo

The on-chain contract manages **metadata only** — no salary values are stored on-chain.

```cairo
#[starknet::contract]
mod PayrollManager {
    use openzeppelin_access::accesscontrol::AccessControlComponent;
    use openzeppelin_introspection::src5::SRC5Component;
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use core::poseidon::poseidon_hash_span;

    // --- Components ---
    component!(path: AccessControlComponent, storage: accesscontrol, event: AccessControlEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl AccessControlImpl =
        AccessControlComponent::AccessControlImpl<ContractState>;
    impl AccessControlInternalImpl =
        AccessControlComponent::InternalImpl<ContractState>;

    // --- Roles ---
    const ADMIN: felt252 = selector!("ADMIN");
    const PAYROLL_MANAGER: felt252 = selector!("PAYROLL_MANAGER");

    // --- Storage ---
    #[storage]
    struct Storage {
        #[substorage(v0)]
        accesscontrol: AccessControlComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        // Company info
        company_name: ByteArray,
        tongo_contract: ContractAddress,  // Tongo instance for payment token
        // Employee registry
        employee_pubkey_x: Map<u32, felt252>,   // index → pubkey.x
        employee_pubkey_y: Map<u32, felt252>,   // index → pubkey.y
        employee_active: Map<u32, bool>,         // index → active
        employee_index: Map<felt252, u32>,       // pubkey_hash → index
        employee_count: u32,
        // Payroll runs
        run_executed: Map<felt252, bool>,         // run_id → executed
        run_commitment: Map<felt252, felt252>,    // run_id → hash commitment
        run_timestamp: Map<felt252, u64>,         // run_id → timestamp
        run_count: u32,
    }

    // --- Events ---
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        AccessControlEvent: AccessControlComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        EmployeeRegistered: EmployeeRegistered,
        EmployeeDeactivated: EmployeeDeactivated,
        PayrollRunRecorded: PayrollRunRecorded,
    }

    #[derive(Drop, starknet::Event)]
    struct EmployeeRegistered {
        #[key]
        index: u32,
        pubkey_hash: felt252,  // NOT the full pubkey — minimize linkability
    }

    #[derive(Drop, starknet::Event)]
    struct EmployeeDeactivated {
        #[key]
        index: u32,
    }

    #[derive(Drop, starknet::Event)]
    struct PayrollRunRecorded {
        #[key]
        run_id: felt252,
        employee_count: u32,
        commitment: felt252,  // poseidon hash of payment details
        timestamp: u64,
    }

    // --- Constructor ---
    #[constructor]
    fn constructor(
        ref self: ContractState,
        admin: ContractAddress,
        tongo_contract: ContractAddress,
        company_name: ByteArray,
    ) {
        self.accesscontrol.initializer();
        self.accesscontrol._grant_role(ADMIN, admin);
        self.accesscontrol._grant_role(PAYROLL_MANAGER, admin);
        self.accesscontrol.set_role_admin(PAYROLL_MANAGER, ADMIN);
        self.tongo_contract.write(tongo_contract);
        self.company_name.write(company_name);
    }

    // --- Interface ---
    #[abi(embed_v0)]
    impl PayrollManagerImpl of super::IPayrollManager<ContractState> {

        // Register a new employee by their Tongo public key
        fn register_employee(
            ref self: ContractState,
            pubkey_x: felt252,
            pubkey_y: felt252,
        ) {
            self.accesscontrol.assert_only_role(ADMIN);
            let pubkey_hash = poseidon_hash_span(
                array![pubkey_x, pubkey_y].span()
            );
            assert!(self.employee_index.read(pubkey_hash) == 0, "Already registered");

            let index = self.employee_count.read() + 1;
            self.employee_pubkey_x.write(index, pubkey_x);
            self.employee_pubkey_y.write(index, pubkey_y);
            self.employee_active.write(index, true);
            self.employee_index.write(pubkey_hash, index);
            self.employee_count.write(index);

            self.emit(EmployeeRegistered { index, pubkey_hash });
        }

        // Deactivate an employee
        fn deactivate_employee(ref self: ContractState, index: u32) {
            self.accesscontrol.assert_only_role(ADMIN);
            assert!(self.employee_active.read(index), "Not active");
            self.employee_active.write(index, false);
            self.emit(EmployeeDeactivated { index });
        }

        // Record that a payroll run was executed (called after multicall transfers)
        fn record_payroll_run(
            ref self: ContractState,
            run_id: felt252,
            employee_count: u32,
            commitment: felt252,
        ) {
            self.accesscontrol.assert_only_role(PAYROLL_MANAGER);
            assert!(!self.run_executed.read(run_id), "Already executed");

            let timestamp = get_block_timestamp();
            self.run_executed.write(run_id, true);
            self.run_commitment.write(run_id, commitment);
            self.run_timestamp.write(run_id, timestamp);
            self.run_count.write(self.run_count.read() + 1);

            self.emit(PayrollRunRecorded {
                run_id, employee_count, commitment, timestamp
            });
        }

        // --- View functions ---
        fn get_employee_count(self: @ContractState) -> u32 {
            self.employee_count.read()
        }

        fn get_employee(self: @ContractState, index: u32) -> (felt252, felt252, bool) {
            (
                self.employee_pubkey_x.read(index),
                self.employee_pubkey_y.read(index),
                self.employee_active.read(index),
            )
        }

        fn is_run_executed(self: @ContractState, run_id: felt252) -> bool {
            self.run_executed.read(run_id)
        }

        fn get_tongo_contract(self: @ContractState) -> ContractAddress {
            self.tongo_contract.read()
        }

        fn get_company_name(self: @ContractState) -> ByteArray {
            self.company_name.read()
        }
    }
}
```

### 4.2 Interface Definition

```cairo
#[starknet::interface]
trait IPayrollManager<TContractState> {
    fn register_employee(ref self: TContractState, pubkey_x: felt252, pubkey_y: felt252);
    fn deactivate_employee(ref self: TContractState, index: u32);
    fn record_payroll_run(
        ref self: TContractState, run_id: felt252, employee_count: u32, commitment: felt252
    );
    fn get_employee_count(self: @TContractState) -> u32;
    fn get_employee(self: @TContractState, index: u32) -> (felt252, felt252, bool);
    fn is_run_executed(self: @TContractState, run_id: felt252) -> bool;
    fn get_tongo_contract(self: @TContractState) -> ContractAddress;
    fn get_company_name(self: @TContractState) -> ByteArray;
}
```

### 4.3 Why PayrollManager Doesn't Call Tongo Directly

Tongo's `transfer()` requires a **ZK proof** that includes `sender_address` in the Fiat-Shamir prefix. The proof must be generated **off-chain** with the employer's Tongo private key. A contract cannot generate ZK proofs.

**Flow**:
1. Frontend generates ZK proofs for each employee transfer via Tongo SDK
2. Frontend batches all `transfer()` calls + `record_payroll_run()` into one multicall
3. Wallet signs and submits the multicall transaction

---

## 5. Core Flows

### 5.1 Employer Onboarding

```
1. Employer connects wallet (Argent/Braavos)
2. Employer generates a Tongo keypair (stored encrypted in browser localStorage)
3. Frontend deploys PayrollManager contract via sncast/starknet.js
   → constructor(admin=employer_wallet, tongo_contract=USDC_TONGO, company_name="Acme")
4. Employer is ready to add employees
```

### 5.2 Employee Registration

```
1. Employer enters employee info in dashboard
2. Employee generates their own Tongo keypair (via employee portal link)
3. Employee shares their Tongo PubKey {x, y} with employer
4. Employer calls PayrollManager.register_employee(pubkey_x, pubkey_y)
5. Employee is now in the on-chain registry
```

### 5.3 Payroll Execution (Core Flow)

```typescript
// === Frontend: Employer Dashboard ===

import StarkZap from 'starkzap';
import { TongoConfidential } from 'starkzap';
import { Account as TongoAccount } from '@fatsolutions/tongo-sdk';

// 1. Initialize StarkZap
const sdk = new StarkZap({ network: 'sepolia' });
const wallet = await sdk.connectWallet();

// 2. Create employer's Tongo confidential account
const employerTongo = new TongoConfidential(
  employerTongoPrivateKey,
  TONGO_USDC_ADDRESS,
  sdk.provider
);

// 3. Fund employer's Tongo account (one-time or per-run)
const fundCalls = await employerTongo.fund({
  amount: totalPayrollBudget,  // e.g., 50000n (USDC units)
  sender: wallet.address,
});
await wallet.execute(fundCalls);

// 4. Generate confidential transfers for each employee
const transferCalls = [];
for (const employee of employees) {
  const call = await employerTongo.transfer({
    amount: employee.salary,          // hidden in ZK proof
    to: employee.tongoPubKey,         // { x, y }
    sender: wallet.address,
  });
  transferCalls.push(call);
}

// 5. Build payroll run commitment
const runId = poseidonHash(companyId, periodId, timestamp);
const commitment = poseidonHash(
  ...employees.map(e => poseidonHash(e.pubkeyHash, e.salary))
);

// 6. Record payroll run on PayrollManager
const recordCall = payrollContract.populate('record_payroll_run', [
  runId,
  employees.length,
  commitment,
]);

// 7. Execute everything in ONE multicall transaction
await wallet.execute([
  ...transferCalls.flat(),
  recordCall,
]);
```

### 5.4 Employee Salary Claim

```typescript
// === Frontend: Employee Portal ===

// 1. Employee connects wallet + loads Tongo account
const employeeTongo = new TongoConfidential(
  employeeTongoPrivateKey,
  TONGO_USDC_ADDRESS,
  provider
);

// 2. Check state (balance is decrypted client-side)
const state = await employeeTongo.getState();
console.log('Pending:', state.pending);   // incoming salary
console.log('Balance:', state.balance);   // available balance

// 3. Rollover: move pending → balance
if (state.pending > 0n) {
  const rolloverCall = await employeeTongo.rollover({
    sender: wallet.address,
  });
  await wallet.execute(rolloverCall);
}

// 4. Withdraw to regular ERC-20 (when employee wants to cash out)
const withdrawCall = await employeeTongo.withdraw({
  amount: withdrawAmount,
  to: wallet.address,       // destination for ERC-20
  sender: wallet.address,
});
await wallet.execute(withdrawCall);
```

### 5.5 Auditor Access

```typescript
// Auditor has the auditor_key configured at Tongo deployment
// Can decrypt any employee's balance and transfer history

const auditorTongo = new TongoAccount(
  auditorPrivateKey,
  TONGO_USDC_ADDRESS,
  provider
);

// Decrypt a specific employee's audit balance
const auditBalance = await auditorTongo.decryptAEBalance(employeePubKey);
```

---

## 6. Frontend Architecture

### 6.1 Project Structure

```
stealthpay-app/
├── index.html
├── vite.config.ts
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── src/
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Router setup
│   ├── vite-env.d.ts
│   │
│   ├── config/
│   │   ├── contracts.ts            # Contract addresses per network
│   │   ├── tokens.ts               # Supported token list
│   │   └── networks.ts             # Starknet network configs
│   │
│   ├── hooks/
│   │   ├── useStarkZap.ts          # StarkZap SDK initialization
│   │   ├── useConfidential.ts      # TongoConfidential account management
│   │   ├── usePayrollContract.ts   # PayrollManager contract interactions
│   │   ├── useWallet.ts            # Wallet connection state
│   │   └── useEmployees.ts         # Employee list from contract
│   │
│   ├── store/
│   │   ├── useAuthStore.ts         # Wallet + role state (Zustand)
│   │   └── usePayrollStore.ts      # Payroll execution state
│   │
│   ├── pages/
│   │   ├── Landing.tsx             # Public landing page
│   │   ├── employer/
│   │   │   ├── Dashboard.tsx       # Overview: balance, employee count, recent runs
│   │   │   ├── Employees.tsx       # Employee registry management
│   │   │   ├── RunPayroll.tsx      # Execute payroll (core UX)
│   │   │   └── History.tsx         # Past payroll runs
│   │   ├── employee/
│   │   │   ├── Portal.tsx          # View balance, rollover, withdraw
│   │   │   └── Setup.tsx           # Generate Tongo keypair
│   │   └── auditor/
│   │       └── AuditView.tsx       # Decrypt and view all records
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── ConnectWallet.tsx
│   │   ├── payroll/
│   │   │   ├── EmployeeTable.tsx
│   │   │   ├── SalaryInput.tsx     # Encrypted salary input
│   │   │   ├── PayrollSummary.tsx  # Preview before execution
│   │   │   └── RunStatus.tsx       # Transaction progress
│   │   ├── confidential/
│   │   │   ├── BalanceDisplay.tsx  # Decrypted balance (client-side)
│   │   │   ├── FundForm.tsx        # Deposit ERC-20 → Tongo
│   │   │   ├── WithdrawForm.tsx    # Tongo → ERC-20
│   │   │   └── TransferStatus.tsx
│   │   └── common/
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── Modal.tsx
│   │       └── TxToast.tsx         # Transaction notifications
│   │
│   ├── lib/
│   │   ├── starkzap.ts            # StarkZap singleton
│   │   ├── tongo.ts               # Tongo account helpers
│   │   ├── crypto.ts              # Keypair generation, storage
│   │   ├── payroll.ts             # Payroll execution logic
│   │   └── utils.ts               # Formatting, hashing
│   │
│   └── types/
│       ├── employee.ts
│       ├── payroll.ts
│       └── contracts.ts
```

### 6.2 Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills(),  // Required for starknet.js Buffer/crypto polyfills
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
```

### 6.3 Key React Hooks

```typescript
// hooks/useConfidential.ts
import { useState, useCallback } from 'react';
import { TongoConfidential } from 'starkzap';
import type { ConfidentialState } from 'starkzap';

export function useConfidential(
  privateKey: bigint | null,
  tongoAddress: string,
  provider: RpcProvider
) {
  const [confidential, setConfidential] = useState<TongoConfidential | null>(null);
  const [state, setState] = useState<ConfidentialState | null>(null);
  const [loading, setLoading] = useState(false);

  const initialize = useCallback(async () => {
    if (!privateKey) return;
    const c = new TongoConfidential(privateKey, tongoAddress, provider);
    setConfidential(c);
    const s = await c.getState();
    setState(s);
  }, [privateKey, tongoAddress, provider]);

  const refreshState = useCallback(async () => {
    if (!confidential) return;
    setLoading(true);
    const s = await confidential.getState();
    setState(s);
    setLoading(false);
  }, [confidential]);

  return { confidential, state, loading, initialize, refreshState };
}
```

### 6.4 Pages Overview

#### Employer Dashboard
- **Overview**: Tongo balance (decrypted), active employee count, last payroll run
- **Employees**: Table with PubKey (truncated), status, registration date. Add/deactivate buttons.
- **Run Payroll**: Select employees → enter salaries → preview → execute multicall. Progress indicator for ZK proof generation.
- **History**: List of past runs with run_id, timestamp, employee count, commitment hash.

#### Employee Portal
- **Setup**: Generate Tongo keypair. Display PubKey for employer to register. Download encrypted backup.
- **Balance**: Decrypted pending + available balance. Rollover button. Withdraw form.

#### Auditor View
- **Decrypt**: Enter auditor key → view all employee balances and transfer history.

---

## 7. Security Considerations

### 7.1 Key Management

| Key | Storage | Risk |
|-----|---------|------|
| Starknet wallet key | Browser wallet (Argent/Braavos) | Standard Web3 security |
| Employer Tongo private key | Browser localStorage (AES-256 encrypted with password) | Must not leak — controls all salary transfers |
| Employee Tongo private key | Browser localStorage (AES-256 encrypted) | If leaked, attacker can see salary + withdraw funds |
| Auditor private key | Offline / hardware | Should be company-controlled, not individual |

### 7.2 Privacy Threats

| Threat | Mitigation |
|--------|-----------|
| Salary amount leaked | Encrypted via ElGamal; only recipient + auditor can decrypt |
| Payment timing analysis | Use opaque run_id (hash); vary execution times |
| Employee count inference | Employee registry is on-chain but uses PubKey pseudonyms, not addresses |
| Tongo PubKey ↔ Starknet address linkage | PubKeys are separate from wallet addresses; linkage only at withdraw |
| Front-running payroll | Multicall is atomic; no intermediate state visible |

### 7.3 Smart Contract Security

- OpenZeppelin AccessControl for role-based permissions
- Duplicate payroll run prevention via `run_executed` mapping
- No salary values stored on-chain (only in Tongo's encrypted state)
- No `selfdestruct` or proxy upgradability (immutable deployment)

---

## 8. Testing Strategy

### 8.1 Contract Tests (snforge)

```cairo
#[test]
fn test_register_employee() {
    // Deploy PayrollManager
    // Register an employee with a PubKey
    // Assert employee_count incremented
    // Assert get_employee returns correct data
}

#[test]
fn test_duplicate_registration_fails() {
    // Register same PubKey twice → should panic
}

#[test]
fn test_access_control() {
    // Non-admin calling register_employee → should panic
}

#[test]
fn test_record_payroll_run() {
    // Record a run
    // Assert run_executed is true
    // Assert duplicate run_id is rejected
}

#[test]
fn test_deactivate_employee() {
    // Deactivate → verify is_active = false
    // Deactivate inactive → should panic
}
```

### 8.2 SDK Integration Tests (TypeScript)

```typescript
describe('Payroll E2E', () => {
  it('employer can fund, transfer, employee can rollover and withdraw', async () => {
    // 1. Deploy Tongo + PayrollManager on devnet
    // 2. Fund employer Tongo account
    // 3. Register employee on PayrollManager
    // 4. Execute confidential transfer
    // 5. Employee rollover
    // 6. Employee withdraw
    // 7. Verify ERC-20 balance
  });

  it('batch payroll for multiple employees', async () => {
    // Fund → batch transfer to 5 employees → verify all received
  });
});
```

---

## 9. Deployment Plan

### Phase 1: Local Development
```bash
# Start local Starknet devnet
starknet-devnet --seed 0

# Deploy MockERC20 + Tongo + PayrollManager
cd contracts && scarb build
sncast deploy ...
```

### Phase 2: Sepolia Testnet
```bash
# Use existing Tongo USDC contract on Sepolia
# Deploy only PayrollManager
sncast --account my_account declare --network sepolia --contract-name PayrollManager
sncast --account my_account deploy --network sepolia --class-hash <HASH> \
  --constructor-calldata <admin> 0x2caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552 ...
```

### Phase 3: Demo
- Record 3-5 minute video showing:
  1. Employer creates company + adds employees
  2. Employer executes batch payroll (show ZK proof generation)
  3. Employee views encrypted balance + rolls over + withdraws
  4. Show on-chain transaction with encrypted amounts
  5. Auditor decrypts all records

---

## 10. Submission Checklist

- [ ] Open-source GitHub repository with functional code
- [ ] README with dependencies, setup instructions, team members
- [ ] Architecture documentation (this document)
- [ ] Demo video (3-5 minutes)
- [ ] Deployed on Starknet Sepolia with working contract addresses
- [ ] Clear explanation of how privacy is improved

---

## 11. Differentiation vs. Existing Solutions

| Feature | StealthPay (Ours) | Paychain (Zama) | Request Finance | Superfluid |
|---------|-------------------|-----------------|-----------------|------------|
| Privacy | ZK + ElGamal (Tongo) | FHE (Zama fhEVM) | None | None |
| Chain | Starknet | Ethereum Sepolia | Multi-chain | Multi-chain |
| Token Support | Any ERC-20 | USDC only | Multi-token | Multi-token |
| Non-custodial | Yes | Yes | Semi | Yes |
| Auditor Support | Built-in (Tongo auditor_key) | Viewing keys | N/A | N/A |
| Gas Cost | <$0.20/transfer | High (FHE compute) | Standard | Standard |
| ZK Security Audit | Yes (ZKSecurity) | No | N/A | N/A |
