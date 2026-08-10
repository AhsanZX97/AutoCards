import { LegalPageLayout, LegalSection } from './LegalPageLayout';

const CONTACT_EMAIL = 'autocardssupport@gmail.com';

export function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="August 9, 2026">
      <LegalSection heading="Overview">
        <p>
          Auto Cards ("we", "us") turns documents you upload into flashcards, and syncs your decks
          and study progress across devices. This policy explains what information we collect,
          why, and who we share it with.
        </p>
      </LegalSection>

      <LegalSection heading="Information We Collect">
        <p>
          <strong className="text-slate-900 dark:text-white">Account information:</strong> your
          email address and password, handled by our authentication provider, Supabase.
        </p>
        <p>
          <strong className="text-slate-900 dark:text-white">Content you upload:</strong> the PDF,
          Word, and PowerPoint documents you upload, and the flashcards generated from them.
        </p>
        <p>
          <strong className="text-slate-900 dark:text-white">Usage data:</strong> study sessions,
          scores, streaks, and deck statistics, used to power your stats and spaced-repetition
          scheduling.
        </p>
        <p>
          <strong className="text-slate-900 dark:text-white">Payment information:</strong> if you
          subscribe to Pro or buy Lifetime, billing is handled entirely by Stripe. We never see or
          store your card details &mdash; we only receive your resulting plan status.
        </p>
      </LegalSection>

      <LegalSection heading="How We Use Your Information">
        <p>
          To generate your flashcards, sync your account and decks across devices, track your
          study progress, process payments and manage your subscription, send you account-related
          emails (like sign-in confirmations), and improve the product.
        </p>
      </LegalSection>

      <LegalSection heading="Third-Party Services">
        <p>We rely on a small number of processors to run Auto Cards:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-slate-900 dark:text-white">Supabase</strong> &mdash;
            authentication, database, and file storage.
          </li>
          <li>
            <strong className="text-slate-900 dark:text-white">OpenRouter</strong> &mdash; the AI
            model that reads the content of documents you upload in order to generate flashcards.
            Please don't upload documents containing sensitive personal or confidential information
            you're not comfortable sending to an AI model.
          </li>
          <li>
            <strong className="text-slate-900 dark:text-white">Stripe</strong> &mdash; payment
            processing for Pro and Lifetime plans.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Data Retention & Deletion">
        <p>
          We keep your account data for as long as your account is active. You can request
          deletion of your account and associated data at any time by emailing us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-slate-900 dark:hover:text-white">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Your Rights">
        <p>
          You can access, correct, or delete your personal data at any time. Contact us and we'll
          take care of it.
        </p>
      </LegalSection>

      <LegalSection heading="Children's Privacy">
        <p>Auto Cards is not intended for children under 13, and we do not knowingly collect their data.</p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          We use reasonable technical and organizational measures to protect your data, but no
          method of transmission or storage is 100% secure.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to This Policy">
        <p>
          If we make material changes to this policy, we'll update the date at the top of this
          page.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about this policy? Email us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-slate-900 dark:hover:text-white">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
