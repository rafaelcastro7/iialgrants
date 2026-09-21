/**
 * Anti-Fabrication Engine (Ported from GrantDesk to IIAL Grants)
 *
 * Verifies that drafted proposal text does not invent numbers, statistics,
 * or named personnel that were not supplied in the organization profile,
 * answer library, knowledge chunks, or grant requirements.
 */

const SPELLED_NUMBERS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
  "million",
] as const;

const NUMBER_WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  sixty: "60",
  seventy: "70",
  eighty: "80",
  ninety: "90",
};

const WORD_FOR_DIGIT: Record<string, string> = Object.fromEntries(
  Object.entries(NUMBER_WORDS).map(([word, digit]) => [digit, word]),
);

/** Titles that mark what follows as a person rather than a place or a programme. */
const PERSON_TITLES = ["Dr", "Dr.", "Prof", "Prof.", "Mr", "Mr.", "Ms", "Ms.", "Mrs", "Mrs."];

export type Fabrication = {
  kind: "number" | "spelled-number" | "person";
  text: string;
};

/** Gaps the model marked instead of filling are correct behaviour, not claims. */
function withoutGaps(draft: string): string {
  return (
    draft
      .replace(/\[NEED:[^\]]*\]/g, " ")
      // A list marker is not a claim. "1. Staffing 2. Materials" was being
      // counted as two invented figures.
      .replace(/^\s*\d{1,2}[.)]\s/gm, " ")
  );
}

function permittedNumbers(facts: readonly string[]): Set<string> {
  const permitted = new Set<string>();
  for (const fact of facts) {
    for (const raw of fact.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
      const number = raw.replace(/,/g, "");
      permitted.add(number);
      const word = WORD_FOR_DIGIT[number];
      if (word) permitted.add(word);
    }
    for (const word of fact.toLowerCase().match(/[a-z]+/g) ?? []) {
      if ((SPELLED_NUMBERS as readonly string[]).includes(word)) {
        permitted.add(word);
        const digit = NUMBER_WORDS[word];
        if (digit) permitted.add(digit);
      }
    }
  }
  return permitted;
}

/**
 * Names the draft introduced that appear nowhere in the supplied facts.
 */
function inventedPeople(text: string, facts: readonly string[]): string[] {
  const haystack = facts.join(" ").toLowerCase();
  const found = new Set<string>();

  const titled = text.match(/\b(?:Dr|Prof|Mr|Ms|Mrs)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g) ?? [];
  for (const match of titled) {
    const name = match.replace(/^\S+\.?\s+/, "");
    if (!haystack.includes(name.toLowerCase())) found.add(match);
  }

  const bare = text.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+(?=,\s*[A-Z]?[a-z])/g) ?? [];
  for (const match of bare) {
    if (haystack.includes(match.toLowerCase())) continue;
    if (PERSON_TITLES.some((title) => match.startsWith(title))) continue;
    found.add(match);
  }

  return [...found];
}

/**
 * Detects all facts in a draft that have no grounding in the supplied facts.
 */
export function fabrications(draft: string, facts: readonly string[]): Fabrication[] {
  const body = withoutGaps(draft);
  const permitted = permittedNumbers(facts);
  const out: Fabrication[] = [];

  for (const raw of body.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    const number = raw.replace(/,/g, "");
    if (!permitted.has(number) && !permitted.has(number.replace(/\.\d+$/, ""))) {
      out.push({ kind: "number", text: raw });
    }
  }

  for (const word of body.toLowerCase().match(/[a-z]+/g) ?? []) {
    if ((SPELLED_NUMBERS as readonly string[]).includes(word) && !permitted.has(word)) {
      out.push({ kind: "spelled-number", text: word });
    }
  }

  for (const person of inventedPeople(body, facts)) {
    out.push({ kind: "person", text: person });
  }

  const seen = new Set<string>();
  return out.filter((f) => {
    const key = `${f.kind}:${f.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
