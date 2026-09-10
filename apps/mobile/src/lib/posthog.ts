import { PostHog } from 'posthog-react-native';

function reportMissingConfiguration(variable: string) {
  if (__DEV__) {
    console.error(
      new Error(
        `${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`,
      ),
    );
  }
}

function createPostHogClient(): PostHog | undefined {
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim();
  const host = process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim();

  if (!apiKey) {
    reportMissingConfiguration('EXPO_PUBLIC_POSTHOG_KEY');
    return undefined;
  }

  if (!host) {
    reportMissingConfiguration('EXPO_PUBLIC_POSTHOG_HOST');
    return undefined;
  }

  return new PostHog(apiKey, { host });
}

export const posthog = createPostHogClient();
