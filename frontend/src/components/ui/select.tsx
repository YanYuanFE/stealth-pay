import { cn } from '@/lib/cn';
import type { HTMLAttributes, ReactNode } from 'react';
import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* ── Context ── */
interface SelectContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  value: string;
  onValueChange: (v: string) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}
const SelectContext = createContext<SelectContextValue | null>(null);
function useSelect() {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error('Select components must be used within <Select>');
  return ctx;
}

/* ── Select Root ── */
interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}

function Select({ value, onValueChange, children }: SelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <SelectContext.Provider value={{ open, setOpen, value, onValueChange, triggerRef }}>
      <div className="relative inline-block">{children}</div>
    </SelectContext.Provider>
  );
}
Select.displayName = 'Select';

/* ── Trigger ── */
const SelectTrigger = forwardRef<HTMLButtonElement, HTMLAttributes<HTMLButtonElement> & { children: ReactNode }>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen, triggerRef } = useSelect();
    return (
      <button
        ref={(node) => {
          triggerRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--fg)] shadow-sm',
          'hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn('shrink-0 text-[var(--fg-faint)] transition-transform', open && 'rotate-180')}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    );
  },
);
SelectTrigger.displayName = 'SelectTrigger';

/* ── Value display ── */
function SelectValue({ placeholder, labels }: { placeholder?: string; labels?: Record<string, string> }) {
  const { value } = useSelect();
  const display = labels?.[value] ?? value;
  return <span>{display || placeholder}</span>;
}
SelectValue.displayName = 'SelectValue';

/* ── Content (dropdown via portal) ── */
const SelectContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, _ref) => {
    const { open, setOpen, triggerRef } = useSelect();
    const contentRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

    // Position relative to trigger
    useEffect(() => {
      if (!open || !triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }, [open, triggerRef]);

    // Click outside to close
    useEffect(() => {
      if (!open) return;
      const handleClick = (e: MouseEvent) => {
        const target = e.target as Node;
        if (
          contentRef.current && !contentRef.current.contains(target) &&
          triggerRef.current && !triggerRef.current.contains(target)
        ) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }, [open, setOpen, triggerRef]);

    if (!open) return null;

    return createPortal(
      <div
        ref={contentRef}
        style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width }}
        className={cn(
          'z-[9998] rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-1 shadow-lg',
          className,
        )}
        {...props}
      >
        {children}
      </div>,
      document.body,
    );
  },
);
SelectContent.displayName = 'SelectContent';

/* ── Item ── */
interface SelectItemProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  children: ReactNode;
}

const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, value: itemValue, children, ...props }, ref) => {
    const { value, onValueChange, setOpen } = useSelect();
    const isSelected = value === itemValue;

    const handleClick = useCallback(() => {
      onValueChange(itemValue);
      setOpen(false);
    }, [itemValue, onValueChange, setOpen]);

    return (
      <div
        ref={ref}
        role="option"
        aria-selected={isSelected}
        onClick={handleClick}
        className={cn(
          'cursor-pointer rounded-md px-2.5 py-1.5 text-xs text-[var(--fg)] transition-colors',
          'hover:bg-[var(--bg-hover)]',
          isSelected && 'bg-[var(--bg-elevated)] font-medium',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
SelectItem.displayName = 'SelectItem';

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
