import { LegalPageLayout, LegalSection } from './LegalPageLayout';
import { useT } from '../../lib/i18n';

const CONTACT_EMAIL = 'autocardssupport@gmail.com';

export function PrivacyPage() {
  const t = useT();
  return (
    <LegalPageLayout title={t('privacy.title')} lastUpdated={t('privacy.lastUpdatedDate')}>
      <LegalSection heading={t('privacy.overview.heading')}>
        <p>{t('privacy.overview.body')}</p>
      </LegalSection>

      <LegalSection heading={t('privacy.collect.heading')}>
        <p>
          <strong className="text-slate-900 dark:text-white">{t('privacy.collect.account.label')}</strong>{' '}
          {t('privacy.collect.account.body')}
        </p>
        <p>
          <strong className="text-slate-900 dark:text-white">{t('privacy.collect.content.label')}</strong>{' '}
          {t('privacy.collect.content.body')}
        </p>
        <p>
          <strong className="text-slate-900 dark:text-white">{t('privacy.collect.usage.label')}</strong>{' '}
          {t('privacy.collect.usage.body')}
        </p>
        <p>
          <strong className="text-slate-900 dark:text-white">{t('privacy.collect.payment.label')}</strong>{' '}
          {t('privacy.collect.payment.body')}
        </p>
      </LegalSection>

      <LegalSection heading={t('privacy.use.heading')}>
        <p>{t('privacy.use.body')}</p>
      </LegalSection>

      <LegalSection heading={t('privacy.thirdParty.heading')}>
        <p>{t('privacy.thirdParty.intro')}</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-slate-900 dark:text-white">{t('privacy.thirdParty.supabase')}</strong> &mdash;{' '}
            {t('privacy.thirdParty.supabase.body')}
          </li>
          <li>
            <strong className="text-slate-900 dark:text-white">{t('privacy.thirdParty.openrouter')}</strong> &mdash;{' '}
            {t('privacy.thirdParty.openrouter.body')}
          </li>
          <li>
            <strong className="text-slate-900 dark:text-white">{t('privacy.thirdParty.stripe')}</strong> &mdash;{' '}
            {t('privacy.thirdParty.stripe.body')}
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading={t('privacy.retention.heading')}>
        <p>
          {t('privacy.retention.before')}{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-slate-900 dark:hover:text-white">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading={t('privacy.rights.heading')}>
        <p>{t('privacy.rights.body')}</p>
      </LegalSection>

      <LegalSection heading={t('privacy.children.heading')}>
        <p>{t('privacy.children.body')}</p>
      </LegalSection>

      <LegalSection heading={t('privacy.security.heading')}>
        <p>{t('privacy.security.body')}</p>
      </LegalSection>

      <LegalSection heading={t('privacy.changes.heading')}>
        <p>{t('privacy.changes.body')}</p>
      </LegalSection>

      <LegalSection heading={t('privacy.contact.heading')}>
        <p>
          {t('privacy.contact.before')}{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-slate-900 dark:hover:text-white">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
