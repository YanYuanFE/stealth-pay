# StealthPay — Confidential Payroll on Starknet

> Pay your team in any token with fully encrypted salary amounts. Powered by zero-knowledge proofs and ElGamal encryption on Starknet.

## Overview

StealthPay is a non-custodial, confidential payroll protocol built on Starknet. Employers can pay employees in any ERC-20 token (USDC, ETH, WBTC, STRK) with **salary amounts fully encrypted on-chain**. Only the intended recipient can decrypt their own salary. An optional auditor key enables authorized compliance review.

### How It Works

1. **Employer registers** a company and deposits tokens into their confidential Tongo account
2. **Employer executes payroll** — the frontend generates ZK proofs for each transfer, batching them into a single multicall transaction
3. **On-chain**, only encrypted `CipherBalance` values are visible — no one can see individual salary amounts
4. **Employees claim** their salary by rolling over pending balance and optionally withdrawing to standard ERC-20
5. **Auditors** (optional) can verify all salary records using their Tongo key without accessing private keys

### Privacy Guarantees

| Data | Public | Employer | Employee | Auditor |
|------|--------|----------|----------|---------|
| Total budget deposited | Visible | Visible | — | Visible |
| Individual salary | **Encrypted** | Knows (generates proof) | Decrypts own | Decrypts all |
| Payment timestamp | Visible | Visible | Visible | Visible |
| Employee identity | Tongo pubkey only | Knows | Knows | Sees pubkey |
| Payroll run count | Visible | Visible | — | Visible |

### Privacy by Design

- **Zero events for HR operations**: `register_employee`, `deactivate_employee`, and `set_salary` emit **no events**, preventing on-chain HR metadata leakage
- **No PII collected**: Employees are identified only by Tongo public keys (base58 addresses) — no names, emails, or documents stored
- **Client-side encryption**: Salary data encrypted/decrypted entirely in the browser via ECDH + ChaCha20; transfers use ZK proofs via Tongo protocol — no server or third party ever sees plaintext
- **No trusted third party**: Unlike FHE-based systems, there is no global decryption key or KMS network

## Architecture

```
Frontend (Vite + React + shadcn/ui)    Smart Contracts (Cairo)
├── Landing Page                       ├── PayrollFactory.cairo
├── Employer Dashboard                 │   ├── register_company()
│   ├── Setup (company registration)   │   ├── delete_company()
│   ├── Employee Registry              │   └── bind/unbind_employee()
│   ├── Fund Account                   ├── PayrollManager.cairo
│   ├── Run Payroll                    │   ├── register_employee()
│   └── History                        │   ├── set_salary() (encrypted)
├── Employee Portal                    │   ├── set_audit_salary()
│   ├── Setup (Tongo keypair)          │   ├── set_cadence()
│   ├── View Salary (decrypt)          │   ├── record_payroll_run()
│   ├── Rollover / Withdraw            │   ├── set/get_auditor()
│   └── Ragequit (emergency exit)      │   └── AccessControl (roles)
├── Auditor Portal                     └── Tongo Contract (deployed)
│   └── Audit company salaries             ├── fund()
└── StarkZap + Tongo SDK                   ├── transfer() ← ZK proof
    ├── ZK proof generation                ├── rollover()
    ├── starknetkit wallet modal           ├── withdraw()
    └── Confidential transfers             └── ragequit()
```

## Features

### Employer
- Register company via factory contract (deploys per-company PayrollManager)
- Register employees by Tongo address (base58) with encrypted salary
- Edit salary and payroll cadence (Monthly / Semi-monthly / Weekly) via dialog
- Fund confidential account (ERC-20 → Tongo encrypted balance)
- Execute batch payroll with ZK proofs (multicall: transfers + record)
- View payroll history with on-chain run details
- Set optional auditor public key for compliance
- Delete company registration

### Employee
- Generate or import Tongo keypair
- Auto-discover employer company from Tongo key
- View decrypted salary and confidential balance
- Claim pending salary (rollover) and withdraw to wallet
- Emergency ragequit (full withdrawal)

### Auditor
- Enter company contract address to audit
- Auto-verify auditor role via on-chain public key matching
- Decrypt all employee salaries using ECDH shared secret
- View employee registry with status, cadence, and salary data

### UI/UX
- Dark / light theme with CSS custom properties (warm editorial palette)
- shadcn/ui component library (Button, Card, Input, Alert, Table, Badge, Dialog, Select)
- Sonner toast notifications with Voyager block explorer links
- Copy-to-clipboard on all addresses and hashes
- Responsive layout with breadcrumb navigation

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Cairo, OpenZeppelin AccessControl |
| Confidential Layer | [Tongo Protocol](https://docs.tongo.cash/protocol/introduction.html) (ElGamal + ZK proofs) |
| Frontend SDK | [StarkZap](https://starkzap.io/) v2.0 + @fatsolutions/tongo-sdk v1.3.2 |
| Frontend | Vite 8 + React 19 + TypeScript + Tailwind CSS v4 |
| UI Components | shadcn/ui-style primitives (custom-built) |
| Wallet | starknetkit (Argent X / Braavos) |
| State | Zustand |
| Notifications | Sonner |
| Network | Starknet Sepolia (testnet) |

## Project Structure

```
starknet/
├── contracts/                    # Cairo smart contracts
│   ├── src/
│   │   ├── interface.cairo           # IPayrollManager + IPayrollFactory traits
│   │   ├── payroll_manager.cairo     # Per-company payroll contract
│   │   └── payroll_factory.cairo     # Factory for deploying companies
│   └── tests/
│       └── test_contract.cairo
├── frontend/               # Frontend application
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.tsx           # Marketing page with cipher ring animation
│   │   │   ├── employer/            # Setup, Dashboard, Employees, Fund, RunPayroll, History
│   │   │   ├── employee/            # Portal, Setup
│   │   │   └── auditor/             # Portal
│   │   ├── components/
│   │   │   ├── ui/                  # shadcn-style primitives (8 components)
│   │   │   ├── layout/Layout.tsx    # App shell with breadcrumb nav
│   │   │   ├── ConnectWallet.tsx    # starknetkit modal
│   │   │   └── CopyButton.tsx
│   │   ├── hooks/                   # usePayrollContract, useConfidential, useTheme
│   │   ├── lib/                     # crypto, salary-crypto, stealthpay, format, utils, toast
│   │   ├── config/                  # Contract addresses, token config
│   │   └── store/                   # Zustand store
│   └── vite.config.ts
└── tongo/                        # Tongo protocol (reference)
```

## Quick Start

### Prerequisites

- [Scarb](https://docs.swmansion.com/scarb/) 2.16+ (Cairo package manager)
- [Starknet Foundry](https://foundry-rs.github.io/starknet-foundry/) 0.57+ (sncast)
- Node.js 20+

### Smart Contracts

```bash
cd contracts
scarb build        # Compile contracts
snforge test       # Run integration tests
```

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev        # Start dev server at http://localhost:5173
```

### Deploy to Sepolia

```bash
# 1. Declare contracts
sncast --account deployer declare --contract-name PayrollManager \
  --url https://starknet-sepolia.infura.io/v3/YOUR_KEY

sncast --account deployer declare --contract-name PayrollFactory \
  --url https://starknet-sepolia.infura.io/v3/YOUR_KEY

# 2. Deploy factory (pass PayrollManager class hash)
sncast --account deployer deploy \
  --class-hash <FACTORY_CLASS_HASH> \
  --arguments "<MANAGER_CLASS_HASH>" \
  --url https://starknet-sepolia.infura.io/v3/YOUR_KEY
```

## Deployed Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| PayrollFactory | `0x0567b4b988962e56911b8b4f2b18a2639a8092a4dd6fccf6c0f3c29bac87d179` |
| PayrollManager (class) | `0x32b7aa924b303c6a0123687c3fca51ff65daf5cd8f824052b122d569c125fe7` |

### Tongo Contracts (Sepolia)

| Token | Contract Address |
|-------|-----------------|
| STRK | `0x408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed` |
| USDC | `0x2caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552` |
| ETH | `0x2cf0dc1d9e8c7731353dd15e6f2f22140120ef2d27116b982fa4fed87f6fef5` |
| WBTC | `0x02b9f62f9be99590ad2505e9e89ca746c8fb67bdb6a4be2a1b9a1d867af7339e` |

## How Privacy Works

StealthPay combines two layers of privacy:

### Layer 1: Salary Encryption (at rest)
- **ECDH key exchange**: `employer_sk × employee_pk = shared_secret`
- **Symmetric encryption**: HKDF-derived key → XChaCha20Poly1305
- **Dual access**: Both employer and employee can decrypt; optional auditor gets a separate encrypted copy
- **On-chain storage**: 6 × u128 limbs per encrypted salary (ciphertext + nonce)

### Layer 2: Confidential Transfers (in transit)
- **Tongo Protocol**: Additively homomorphic ElGamal on the Stark curve
- **ZK proofs**: Each transfer proves ownership, amount positivity, and sufficient balance (~120K Cairo steps)
- **No trusted setup**: All cryptography is discrete-log based on the Stark curve
- **Anti-spam**: Dual balance model (current + pending) prevents proof invalidation attacks

### vs. FHE-based approaches (e.g., Zama fhEVM)

| | StealthPay (ZK) | FHE-based |
|---|---|---|
| Trust model | **No trusted third party** | Requires KMS network |
| On-chain computation | Verify proofs only | Compute on ciphertexts |
| Key management | User-held keys | Global decryption key |
| Gas cost | Low (~120K steps/transfer) | High (FHE operations) |
| PII requirement | None (pubkey-only identity) | Often requires off-chain DB |

## Hackathon

**PL_Genesis: Frontiers of Collaboration** — Starknet Bounty ($5,000)

*"Design and build tools that enhance financial privacy, leveraging zero-knowledge proofs and Starknet's scalable cryptographic infrastructure."*

## License

MIT
