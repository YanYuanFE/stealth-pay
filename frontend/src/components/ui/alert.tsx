import { cn } from '@/lib/cn';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';

const alertVariants = cva(
  'relative w-full rounded-2xl border p-4 text-sm',
  {
    variants: {
      variant: {
        default: 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--fg-muted)]',
        info: 'bg-[var(--alert-info-bg)] border-[var(--alert-info-border)] text-[var(--alert-info-fg)]',
        warning: 'bg-[var(--alert-warn-bg)] border-[var(--alert-warn-border)] text-[var(--alert-warn-fg)]',
        destructive: 'bg-[var(--alert-err-bg)] border-[var(--alert-err-border)] text-[var(--alert-err-fg)]',
        success: 'bg-[var(--alert-ok-bg)] border-[var(--alert-ok-border)] text-[var(--alert-ok-fg)]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  ),
);
Alert.displayName = 'Alert';

const AlertTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-medium leading-none tracking-tight', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm leading-relaxed', className)}
    {...props}
  />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription, alertVariants };
export type { AlertProps };
