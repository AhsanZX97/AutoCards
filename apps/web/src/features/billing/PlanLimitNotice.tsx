import { Link } from 'react-router-dom';
import { useT } from '../../lib/i18n';

interface PlanLimitNoticeProps {
  message: string;
  /** The link's wording, when "See plans" is not the right next step. */
  action?: string;
}

/**
 * A limit someone has just run into, with the way past it attached.
 *
 * Every one of these used to end in "get in touch", which is a dead end at the
 * exact moment somebody is motivated to pay. The limits are real and enforced
 * now, so the honest thing to show alongside one is the plan that lifts it.
 */
export function PlanLimitNotice({ message, action }: PlanLimitNoticeProps) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
      <p>{message}</p>
      <Link
        to="/app/settings?tab=billing"
        className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
      >
        {action ?? t('billing.seePlans')}
      </Link>
    </div>
  );
}
