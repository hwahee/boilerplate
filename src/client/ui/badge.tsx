import type { ReactNode } from 'react';

interface BadgeProps {
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  children: ReactNode;
  testId?: string;
}

export function Badge({ tone = 'neutral', children, testId }: BadgeProps) {
  return (
    <span className={`badge badge--${tone}`} data-testid={testId}>
      {children}
    </span>
  );
}
