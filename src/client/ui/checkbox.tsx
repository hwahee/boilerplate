import { useId } from 'react';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Required: every interactive element must be automatable (docs/ui-automation.md). */
  testId: string;
  disabled?: boolean;
  /** Accessible name override for terse visual labels. */
  'aria-label'?: string;
}

export function Checkbox({
  label,
  checked,
  onChange,
  testId,
  disabled,
  'aria-label': ariaLabel,
}: CheckboxProps) {
  const id = useId();
  return (
    <span className="checkbox">
      <input
        id={id}
        type="checkbox"
        className="checkbox__input"
        data-testid={testId}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label className="checkbox__label" htmlFor={id}>
        {label}
      </label>
    </span>
  );
}
