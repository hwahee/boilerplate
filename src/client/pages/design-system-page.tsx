/**
 * Design System — every token and component visible in one place, in every
 * state. The header controls switch theme (light/dark), design variant
 * (A = aesthetic / B = high-visibility) and language live on this page,
 * because everything below renders exclusively from semantic CSS tokens.
 */
import { hexColor, type HexColor } from '@shared/color';
import { Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';

import { useI18n } from '../i18n/locale-context';
import { TESTID } from '../testing/testids';
import { Accordion } from '../ui/accordion';
import { Alert } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { InlineField } from '../ui/inline-field';
import { Palette, type PaletteSwatch } from '../ui/palette';
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

/** The palette's contrast check needs a concrete background; the sample below sits on white. */
const SAMPLE_BACKGROUND = hexColor('#ffffff');

export function DesignSystemPage() {
  const { t } = useI18n();
  const [checked, setChecked] = useState(true);
  const [selectValue, setSelectValue] = useState<'one' | 'two'>('one');
  const [brandColor, setBrandColor] = useState<HexColor>(() => hexColor('#6366f1'));
  const [clientCount, setClientCount] = useState('3');
  const [rate, setRate] = useState('1.0');
  const [pathId, setPathId] = useState('42');
  const [pathQuery, setPathQuery] = useState('');
  // Recent colors live here, not in the component — see docs/palette-design.md §5.3.
  const [recentColors, setRecentColors] = useState<readonly PaletteSwatch[]>([]);

  const pickColor = (next: HexColor) => {
    setBrandColor(next);
    setRecentColors((previous) =>
      [{ value: next, name: next }, ...previous.filter((swatch) => swatch.value !== next)].slice(
        0,
        8,
      ),
    );
  };

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

      <Section id="color-input" title={t('designSystem.colorInput')}>
        <div className="ds-row">
          <Palette
            label="Brand color"
            value={brandColor}
            onChange={pickColor}
            recent={recentColors}
            contrastAgainst={SAMPLE_BACKGROUND}
            testId="ds.palette"
          />
          <span className="ds-color-sample" style={{ color: brandColor }}>
            Sample text on white — {brandColor}
          </span>
        </div>
        <p className="muted">
          Presets, a hex field and the system picker (with an opacity slider — alpha is part of the
          value). Hovering or arrowing onto a swatch shows the exact string it will return. The
          popup opens in the top layer, so it is never clipped and shifts no layout.
        </p>
      </Section>

      <Section id="inline-field" title={t('designSystem.inlineField')}>
        <p className="inline-field-text">
          Values that only read correctly in context go in the sentence, not under a label — clients{' '}
          <InlineField
            name="count"
            value={clientCount}
            onChange={(event) => setClientCount(event.target.value)}
            testId="ds.inline-field.count"
          />{' '}
          firing{' '}
          <InlineField
            name="per second"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            testId="ds.inline-field.rate"
          />{' '}
          requests each.
        </p>

        <p className="inline-field-text">
          <code>/test/</code>
          <InlineField
            name="id"
            value={pathId}
            onChange={(event) => setPathId(event.target.value)}
            invalid={pathId.trim() === ''}
            testId="ds.inline-field.path-id"
          />
          <code>/query/</code>
          <InlineField
            name="query"
            value={pathQuery}
            onChange={(event) => setPathQuery(event.target.value)}
            invalid={pathQuery.trim() === ''}
            testId="ds.inline-field.path-query"
          />
        </p>

        <div className="ds-row inline-field-text">
          <InlineField name="organizationId" defaultValue="7" testId="ds.inline-field.long-name" />
          <InlineField name="none" disabled testId="ds.inline-field.disabled" />
        </div>

        <p className="muted">
          The blank widens with its value, and a name longer than the value widens the blank rather
          than colliding with its neighbour — over 16 characters it truncates, with the full name on
          the label&rsquo;s <code>title</code>. Empty-but-required sets <code>aria-invalid</code>,
          the same contract as <code>TextField</code>. Deliberately not a <code>.field__input</code>{' '}
          variant: the skins restyle that class as a boxed control, which a blank in a sentence must
          not inherit.
        </p>
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

      <Section id="disclosure" title={t('designSystem.disclosure')}>
        <Accordion
          mode="single"
          defaultOpenIds={['motion']}
          testId="ds.accordion"
          items={[
            {
              id: 'motion',
              title: 'Escape hatch #0 — the shift is animated',
              content: (
                <p>
                  Expanding inline content inevitably shifts everything below it. Instead of an
                  instant jump, panels animate open on <code>--duration-expand</code> so the eye can
                  track where content moved. Skins stay in charge: the office skin zeroes the token
                  (instant, like the era), kids stretches it with a springy overshoot, and{' '}
                  <code>prefers-reduced-motion</code> disables it entirely.
                </p>
              ),
            },
            {
              id: 'anchor',
              title: 'Escape hatch #1 — the clicked trigger stays put',
              content: (
                <>
                  <p>
                    In <code>single</code> mode, opening this item collapses the (possibly taller)
                    item above it — without correction, this header would slide up and away from
                    your pointer mid-click. The component records the trigger&apos;s viewport
                    position and compensates the scroll frame-by-frame while layout settles, so the
                    row you clicked never moves under your cursor.
                  </p>
                  <p>
                    Try it: open the first item, scroll until both headers sit mid-viewport, then
                    open this one. The header holds still while the panel above folds away.
                  </p>
                  <p>
                    The correction measures the real delta each frame rather than predicting it, so
                    it converges even when the browser&apos;s own scroll anchoring joins in.
                  </p>
                </>
              ),
            },
            {
              id: 'reveal',
              title: 'Escape hatch #2 — opened content is revealed',
              content: (
                <p>
                  If an opened panel ends up cut off by the bottom of the viewport, the page scrolls
                  just enough to bring it into view — never so far that this header leaves the
                  viewport. A shift the user asked for is guidance; a shift they didn&apos;t is CLS.
                </p>
              ),
            },
          ]}
        />
      </Section>
    </section>
  );
}
