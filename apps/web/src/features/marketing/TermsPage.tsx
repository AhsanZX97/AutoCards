import { LegalPageLayout, LegalSection } from './LegalPageLayout';
import { useT } from '../../lib/i18n';

const CONTACT_EMAIL = 'autocardssupport@gmail.com';

export function TermsPage() {
  const t = useT();
  return (
    <LegalPageLayout title={t('terms.title')} lastUpdated={t('terms.lastUpdatedDate')}>
      <LegalSection heading={t('terms.acceptance.heading')}>
        <p>{t('terms.acceptance.body')}</p>
      </LegalSection>

      <LegalSection heading={t('terms.description.heading')}>
        <p>{t('terms.description.body')}</p>
      </LegalSection>

      <LegalSection heading={t('terms.accounts.heading')}>
        <p>{t('terms.accounts.body')}</p>
      </LegalSection>

      <LegalSection heading={t('terms.billing.heading')}>
        <p>{t('terms.billing.body1')}</p>
        <p>{t('terms.billing.body2')}</p>
      </LegalSection>

      <LegalSection heading={t('terms.acceptableUse.heading')}>
        <p>{t('terms.acceptableUse.body')}</p>
      </LegalSection>

      <LegalSection heading={t('terms.content.heading')}>
        <p>{t('terms.content.body1')}</p>
        <p>{t('terms.content.body2')}</p>
      </LegalSection>

      <LegalSection heading={t('terms.ip.heading')}>
        <p>{t('terms.ip.body')}</p>
      </LegalSection>

      <LegalSection heading={t('terms.termination.heading')}>
        <p>
          {t('terms.termination.before')}{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-slate-900 dark:hover:text-white">
            {CONTACT_EMAIL}
          </a>
          . {t('terms.termination.after')}
        </p>
      </LegalSection>

      <LegalSection heading={t('terms.warranties.heading')}>
        <p>{t('terms.warranties.body')}</p>
      </LegalSection>

      <LegalSection heading={t('terms.liability.heading')}>
        <p>{t('terms.liability.body')}</p>
      </LegalSection>

      <LegalSection heading={t('terms.changes.heading')}>
        <p>{t('terms.changes.body')}</p>
      </LegalSection>

      <LegalSection heading={t('terms.contact.heading')}>
        <p>
          {t('terms.contact.before')}{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-slate-900 dark:hover:text-white">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
