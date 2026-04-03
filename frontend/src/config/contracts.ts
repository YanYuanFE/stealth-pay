export const SEPOLIA_RPC_URL = 'https://starknet-sepolia.infura.io/v3/4fb6afdca8f74fa6845f3bbe0387d5cb';

export const NETWORKS = {
  sepolia: {
    name: 'Starknet Sepolia',
    rpcUrl: SEPOLIA_RPC_URL,
    chainId: 'SN_SEPOLIA',
  },
  mainnet: {
    name: 'Starknet Mainnet',
    rpcUrl: 'https://starknet-mainnet.public.blastapi.io',
    chainId: 'SN_MAIN',
  },
} as const;

export const TONGO_CONTRACTS = {
  sepolia: {
    STRK: '0x408163bfcfc2d76f34b444cb55e09dace5905cf84c0884e4637c2c0f06ab6ed',
    ETH: '0x2cf0dc1d9e8c7731353dd15e6f2f22140120ef2d27116b982fa4fed87f6fef5',
    USDC: '0x2caae365e67921979a4e5c16dd70eaa5776cfc6a9592bcb903d91933aaf2552',
    WBTC: '0x02b9f62f9be99590ad2505e9e89ca746c8fb67bdb6a4be2a1b9a1d867af7339e',
  },
  mainnet: {
    WBTC: '0x6d82c8c467eac77f880a1d5a090e0e0094a557bf67d74b98ba1881200750e27',
    USDC: '0x026f79017c3c382148832c6ae50c22502e66f7a2f81ccbdb9e1377af31859d3a',
    USDT: '0x659c62ba8bc3ac92ace36ba190b350451d0c767aa973dd63b042b59cc065da0',
    ETH: '0x276e11a5428f6de18a38b7abc1d60abc75ce20aa3a925e20a393fcec9104f89',
  },
} as const;

export const PAYROLL_CLASS_HASH = '0x32b7aa924b303c6a0123687c3fca51ff65daf5cd8f824052b122d569c125fe7';

export const PAYROLL_FACTORY = {
  sepolia: '0x0567b4b988962e56911b8b4f2b18a2639a8092a4dd6fccf6c0f3c29bac87d179',
} as const;

export const DEFAULT_NETWORK = 'sepolia';
export const DEFAULT_TOKEN = 'STRK';

// Company config stored in localStorage
export interface CompanyConfig {
  companyName: string;
  payrollContract: string;
  tongoContract: string;
  selectedToken: string;
  adminAddress: string;
  createdAt: number;
  auditorKey?: string;
}

const COMPANY_STORAGE_KEY = 'stealthpay_company';

export function saveCompanyConfig(config: CompanyConfig): void {
  localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(config));
}

export function loadCompanyConfig(): CompanyConfig | null {
  const raw = localStorage.getItem(COMPANY_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasCompanyConfig(): boolean {
  return localStorage.getItem(COMPANY_STORAGE_KEY) !== null;
}

export function clearCompanyConfig(): void {
  localStorage.removeItem(COMPANY_STORAGE_KEY);
}
