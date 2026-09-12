import posthogJs, { type PostHog } from 'posthog-js';

function reportMissingConfiguration(variable: string) {
  if (import.meta.env.DEV) {
    console.error(
      new Error(
        `${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`,
      ),
    );
  }
}

function createPostHogClient(): PostHog | undefined {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY?.trim();
  const host = import.meta.env.VITE_POSTHOG_HOST?.trim();

  if (!apiKey) {
    reportMissingConfiguration('VITE_POSTHOG_KEY');
    return undefined;
  }

  if (!host) {
    reportMissingConfiguration('VITE_POSTHOG_HOST');
    return undefined;
  }

  posthogJs.init(apiKey, {
    api_host: host,
    capture_pageview: 'history_change',
    capture_pageleave: true,
  });
  return posthogJs;
}

export const posthog = createPostHogClient();
