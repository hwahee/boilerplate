/**
 * Design System — every token and component visible in one place, in every
 * state. The header controls switch theme (light/dark), design variant
 * (A = aesthetic / B = high-visibility) and language live on this page,
 * because everything below renders exclusively from semantic CSS tokens.
 */
import { Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';

import { useI18n } from '../i18n/locale-context';
import { TESTID } from '../testing/testids';
import { Alert } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Select } from '../ui/select';
import { Spinner } from '../ui/spinner';
import { TextField } from '../ui/text-field';

/** The semantic color tokens (see src/client/styles/tokens.css). */
const COLOR_TOKENS = [
  '--color-bg',
  '--color-surface',
  '--color-text',
  '--color-text-muted',
  '--color-border',
  '--color-primary',
  '--color-primary-contrast',
  '--color-success',
  '--color-warning',
  '--color-danger',
] as const;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="ds-section"
      aria-labelledby={`ds-${id}`}
      data-testid={TESTID.designSystem.section(id)}
    >
      <h3 id={`ds-${id}`}>{title}</h3>
      {children}
    </section>
  );
}

export function DesignSystemPage() {
  const { t } = useI18n();
  const [checked, setChecked] = useState(true);
  const [selectValue, setSelectValue] = useState<'one' | 'two'>('one');

  return (
    <section data-testid={TESTID.designSystem.page} aria-labelledby="ds-heading">
      <h2 id="ds-heading">{t('designSystem.title')}</h2>
      <p className="muted">{t('designSystem.description')}</p>

      <Section id="colors" title={t('designSystem.colors')}>
        <ul className="swatch-grid" role="list">
          {COLOR_TOKENS.map((token) => (
            <li key={token} className="swatch">
              <span className="swatch__chip" style={{ background: `var(${token})` }} />
              <code>{token}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="typography" title={t('designSystem.typography')}>
        <h1>Heading 1 — 다람쥐 헌 쳇바퀴에 타고파</h1>
        <h2>Heading 2 — The quick brown fox</h2>
        <h3>Heading 3</h3>
        <p>
          Body — jumps over the lazy dog. 키스의 고유조건은 입술끼리 만나야 하고 특별한 기술은
          필요치 않다.
        </p>
        <p className="muted">Muted body — secondary information.</p>
        <p>
          <code>code — const answer = 42;</code>
        </p>
      </Section>

      <Section id="buttons" title={t('designSystem.buttons')}>
        <div className="ds-row">
          <Button testId="ds.button.primary">Primary</Button>
          <Button variant="secondary" testId="ds.button.secondary">
            Secondary
          </Button>
          <Button variant="danger" testId="ds.button.danger">
            Danger
          </Button>
          <Button variant="ghost" testId="ds.button.ghost">
            Ghost
          </Button>
          <Button disabled testId="ds.button.disabled">
            Disabled
          </Button>
          <Button loading testId="ds.button.loading">
            Loading
          </Button>
        </div>
      </Section>

      <Section id="form-fields" title={t('designSystem.formFields')}>
        <div className="ds-grid">
          <TextField label="Text field" placeholder="Placeholder" testId="ds.field.default" />
          <TextField
            label="With error"
            defaultValue="Invalid value"
            error="This value is not valid."
            testId="ds.field.error"
          />
          <TextField
            label="Disabled"
            disabled
            defaultValue="Read only"
            testId="ds.field.disabled"
          />
          <Select<'one' | 'two'>
            label="Select"
            value={selectValue}
            options={[
              { value: 'one', label: 'Option one' },
              { value: 'two', label: 'Option two' },
            ]}
            onChange={setSelectValue}
            testId="ds.select"
          />
          <Checkbox label="Checkbox" checked={checked} onChange={setChecked} testId="ds.checkbox" />
        </div>
      </Section>

      <Section id="feedback" title={t('designSystem.feedback')}>
        <div className="ds-stack">
          <Alert tone="info">Info — something noteworthy happened.</Alert>
          <Alert tone="success">Success — the operation completed.</Alert>
          <Alert
            tone="error"
            action={
              <Button variant="secondary" testId="ds.alert.retry">
                {t('common.retry')}
              </Button>
            }
          >
            Error — something went wrong.
          </Alert>
          <div className="ds-row">
            <Spinner label={t('common.loading')} />
            <Badge>Neutral</Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="danger">Danger</Badge>
          </div>
        </div>
      </Section>

      <Section id="data-display" title={t('designSystem.dataDisplay')}>
        <div className="ds-grid">
          <Card
            title="Card with image"
            image={{ src: 'https://picsum.photos/640/360', alt: 'Random placeholder landscape' }}
            testId="ds.card.image"
          >
            <p className="muted">
              <ImageIcon aria-hidden size="1em" /> Cover images load lazily and always carry alt
              text.
            </p>
          </Card>
          <Card title="Plain card" testId="ds.card.plain">
            <p>Cards group related content on a surface token.</p>
          </Card>
        </div>
      </Section>
    </section>
  );
}
