interface SpinnerProps {
  size?: 'sm' | 'md';
  /** Screen-reader text; when set the spinner is a `role="status"` live region. */
  label?: string;
  testId?: string;
}

export function Spinner({ size = 'md', label, testId }: SpinnerProps) {
  return (
    <span
      className={`spinner spinner--${size}`}
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
      data-testid={testId}
    >
      {label && <span className="visually-hidden">{label}</span>}
    </span>
  );
}
