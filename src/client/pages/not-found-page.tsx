import { Link } from 'react-router';

import { useI18n } from '../i18n/locale-context';
import { TESTID } from '../testing/testids';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <section data-testid={TESTID.notFound.page} aria-labelledby="nf-heading">
      <h2 id="nf-heading">{t('notFound.title')}</h2>
      <p>
        <Link to="/" data-testid={TESTID.notFound.homeLink}>
          {t('notFound.goHome')}
        </Link>
      </p>
    </section>
  );
}
