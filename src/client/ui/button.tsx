import type { ButtonHTMLAttributes } from 'react';

import { Spinner } from './spinner';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** Shows a spinner and blocks interaction; announced via aria-busy. */
  loading?: boolean;
  /** Required: every interactive element must be automatable (docs/ui-automation.md). */
  testId: string;
}

/** Design-system button. Icon-only usage MUST pass `aria-label`. */
export function Button({
  variant = 'primary',
  loading = false,
  testId,
  disabled,
  children,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type ?? 'button'}
      className={`btn btn--${variant}`}
      data-testid={testId}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
