// SPEC §12 limitations and non-goals
export const LIMITS = [
  "Each limit is per request; there are no running budgets.",
  "A stolen owner key is not protected against.",
  "Harmful actions inside the granted limits are still allowed.",
  "A completed payment cannot be undone.",
  "Services that skip the check are not protected.",
  "Revocation is only as fresh as the last registry read.",
  "Replay protection lives in memory and resets on restart.",
  "The payment adapter is run by the backend.",
  "The LLM agent shows the threat; it is not part of the guarantee.",
];
