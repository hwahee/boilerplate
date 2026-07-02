import type { ReactNode } from 'react';

interface AlertProps {
  tone: 'info' | 'success' | 'error';
  children: ReactNode;
  /** Optional action (e.g. a retry button) rendered inside the alert. */
  action?: ReactNode;
  testId?: string;
}

/** `role="alert"` makes errors announce immediately in screen readers. */
export function Alert({ tone, children, action, testId }: AlertProps) {
  return (
    <div
      className={`alert alert--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      data-testid={testId}
    >
      <div className="alert__body">{children}</div>
      {action && <div className="alert__action">{action}</div>}
    </div>
  );
}
