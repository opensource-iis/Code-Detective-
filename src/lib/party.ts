/** Realtime server host, no protocol prefix (ARCHITECTURE.md → Deployment). */
export const PARTYKIT_HOST =
  process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";

/** The kebab-cased Durable Object binding name (partyserver routing). */
export const PARTY_NAME = "code-detective";
