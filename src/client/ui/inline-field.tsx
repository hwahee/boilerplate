/**
 * Inline field — a "Mad Libs" blank: an input that sits inside a run of text
 * rather than under a label, for values that only read correctly in context
 * ("클라이언트 __개가 초당 __회"), or a URL template's `/test/{id}`.
 *
 * Two structural choices carry the pattern:
 *
 *   1. It is deliberately NOT built on `.field__input`. The skins restyle that
 *      class as a boxed control — office sinks it into a bevel, kids gives it a
 *      pill and a sticker shadow — and a blank inside a sentence must inherit
 *      none of that. The rule weight is a token (`--inline-field-rule`) so each
 *      skin still gets a weight that suits it.
 *   2. The wrapper is an `inline-grid`, so its single column is as wide as the
 *      wider of input and name. A long name therefore widens its own blank
 *      instead of colliding with the next one, and the name — being in flow
 *      rather than absolutely positioned — can never be clipped by a scrolling
 *      ancestor.
 *
 * Width tracks the value through `field-sizing: content`. Where that is not
 * supported the blank stays at its `min-width` instead of growing, which is a
 * degradation rather than a break.
 */
import { useId, type InputHTMLAttributes } from 'react';

interface InlineFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'className' | 'size'
> {
  /** Rendered under the blank, and used as the input's accessible name. */
  name: string;
  /** Required but not filled in: draws the danger rule and sets aria-invalid. */
  invalid?: boolean;
  /** Required: every interactive element must be automatable (docs/ui-automation.md). */
  testId: string;
}

export function InlineField({ name, invalid, testId, ...rest }: InlineFieldProps) {
  const id = useId();
  return (
    <span className="inline-field">
      <input
        {...rest}
        id={id}
        // Narrow starting point for browsers without `field-sizing`; the CSS
        // min-width then governs, instead of the UA's ~20ch default.
        size={1}
        className="inline-field__input"
        data-testid={testId}
        aria-invalid={invalid ? true : undefined}
      />
      {/* `title` keeps the full name reachable when the width cap truncates it. */}
      <label className="inline-field__name" htmlFor={id} title={name}>
        {name}
      </label>
    </span>
  );
}
