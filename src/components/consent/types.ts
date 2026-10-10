/** Public analytics configuration, resolved on the server at render time. */
export type AnalyticsConfig = {
  umami: { src: string; websiteId: string } | null;
  posthog: { key: string; host: string } | null;
};
