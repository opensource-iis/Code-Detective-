/** Nickname handling: sanitize, filter, dedupe, plus the alias suggester. */

export const NAME_MAX_LENGTH = 14;

const BLOCKLIST = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "cunt",
  "nigg",
  "fag",
  "slut",
  "whore",
  "porn",
  "sex",
  "rape",
  "nazi",
  "chutiya",
  "bhosdi",
  "madarch",
  "behench",
  "gandu",
  "lauda",
  "lawda",
  "randi",
];

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "!": "i",
};

function deleet(value: string): string {
  return value
    .toLowerCase()
    .replace(/[013457@$!]/g, (c) => LEET[c])
    .replace(/[^a-z]/g, "");
}

export class NameRejectedError extends Error {}

/** Trim, collapse whitespace, strip control chars, cap length, filter. Throws NameRejectedError. */
export function sanitizeName(raw: string): string {
  const cleaned = raw
    .replace(/\p{Cc}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX_LENGTH)
    .trim();
  if (cleaned.length === 0) {
    throw new NameRejectedError("A detective needs a name.");
  }
  const flat = deleet(cleaned);
  if (BLOCKLIST.some((word) => flat.includes(word))) {
    throw new NameRejectedError("Choose another alias, Detective.");
  }
  return cleaned;
}

/** "Ace" taken -> "Ace 2", "Ace 3", ... Result still fits NAME_MAX_LENGTH. */
export function dedupeName(name: string, taken: string[]): string {
  const takenLower = new Set(taken.map((t) => t.toLowerCase()));
  if (!takenLower.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = name.slice(0, NAME_MAX_LENGTH - suffix.length) + suffix;
    if (!takenLower.has(candidate.toLowerCase())) return candidate;
  }
}

const ALIAS_RANKS = [
  "Inspector",
  "Constable",
  "Sergeant",
  "Detective",
  "Sleuth",
  "Agent",
];

const ALIAS_SURNAMES = [
  "Marmalade",
  "Thimble",
  "Copperpot",
  "Wexley",
  "Fogg",
  "Quill",
  "Bramble",
  "Pemberton",
  "Ashcroft",
  "Larkspur",
  "Grimsby",
  "Fenwick",
  "Mortlake",
  "Paisley",
  "Hawthorne",
  "Cobble",
];

/** Client-side suggestion for kids who stall at the keyboard. Fits NAME_MAX_LENGTH. */
export function suggestAlias(): string {
  const rank = ALIAS_RANKS[Math.floor(Math.random() * ALIAS_RANKS.length)];
  const surname =
    ALIAS_SURNAMES[Math.floor(Math.random() * ALIAS_SURNAMES.length)];
  const alias = `${rank.slice(0, 3)}. ${surname}`;
  return alias.slice(0, NAME_MAX_LENGTH);
}
