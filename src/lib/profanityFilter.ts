// Hand-curated starting list, kept in sync manually with the
// chat_messages_no_profanity CHECK constraint in
// supabase/migrations/0013_chat_moderation.sql. Not exhaustive detection --
// a pragmatic first filter, not a complete solution.
const PROFANITY_TERMS = [
  "씨발",
  "씨팔",
  "씨불",
  "개새끼",
  "개새꺄",
  "병신",
  "지랄",
  "좆",
  "좇",
  "존나",
  "니미럴",
  "느금마",
  "걸레년",
  "창녀",
  "미친놈",
  "미친년",
];

const PROFANITY_PATTERN = new RegExp(PROFANITY_TERMS.join("|"), "i");

export function containsProfanity(text: string): boolean {
  return PROFANITY_PATTERN.test(text);
}
