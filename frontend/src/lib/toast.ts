import { toast } from 'sonner';

const EXPLORER = 'https://sepolia.voyager.online';

export function txUrl(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}

export function contractUrl(addr: string): string {
  return `${EXPLORER}/contract/${addr}`;
}

export function toastTxSuccess(message: string, txHash: string) {
  toast.success(message, {
    description: `Tx: ${txHash.slice(0, 12)}...${txHash.slice(-6)}`,
    action: {
      label: 'View',
      onClick: () => window.open(txUrl(txHash), '_blank'),
    },
    duration: 8000,
  });
}

export function toastTxError(message: string, err?: unknown) {
  const detail = err instanceof Error ? err.message : String(err ?? '');
  toast.error(message, {
    description: detail ? detail.slice(0, 120) : undefined,
    duration: 6000,
  });
}

export function toastInfo(message: string) {
  toast.info(message, { duration: 3000 });
}
