import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from '../ui';
import { useT } from '../../lib/i18n';
import './auth.css';

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  const t = useT();
  return (
    <div className="auth-page">
      <header className="auth-header">
        <Link to="/" className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-700">
          <Wordmark className="text-xl" />
        </Link>
      </header>
      <main className="auth-main">
        <section className="auth-story" aria-labelledby="auth-story-title">
          <h2 id="auth-story-title">{t('auth.layout.headline')}<br /><span>{t('auth.layout.headlineAccent')}</span></h2>
          <p className="auth-story-body">{t('auth.layout.description')}</p>
          <div className="auth-sample">
            <div className="auth-sample-back" aria-hidden="true" />
            <div className="auth-sample-card">
              <div className="auth-sample-meta"><span>{t('auth.layout.subject')}</span><span>01 / 12</span></div>
              <dl>
                <dt>{t('auth.layout.question')}</dt>
                <dd><span className="auth-answer-label">{t('flashcardView.answer')}</span>{t('auth.layout.answer')}</dd>
              </dl>
            </div>
          </div>
        </section>
        <section className="auth-stack" aria-labelledby="auth-title">
          <div className="auth-stack-back auth-stack-back-cyan" aria-hidden="true" />
          <div className="auth-stack-back auth-stack-back-blue" aria-hidden="true" />
          <div className="auth-form-card">
            <div className="auth-card-topline" aria-hidden="true">
              <span className="auth-card-symbol">▱<span>▱</span></span>
              <span className="auth-card-dots"><i /><i /><i /></span>
            </div>
            <h1 id="auth-title">{title}</h1>
            <p className="auth-form-subtitle">{subtitle}</p>
            <div className="auth-form-content">{children}</div>
          </div>
        </section>
      </main>
    </div>
  );
}
