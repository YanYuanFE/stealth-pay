import { cn } from '@/lib/cn';
import type { InputHTMLAttributes } from 'react';
import { forwardRef } from 'react';

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      className={cn(
        'flex h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-sm text-[var(--fg)] shadow-sm transition-colors placeholder:text-[var(--fg-placeholder)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:border-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
