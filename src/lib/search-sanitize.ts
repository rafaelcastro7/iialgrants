/**
 * Sanitize a user-supplied search term before interpolating it into a PostgREST
 * filter string (e.g. `.or("name.ilike.%<term>%,...")`).
 *
 * PostgREST parses commas as condition separators and parentheses as grouping,
 * so an unescaped `,` `(` `)` `:` `*` `%` lets a user break the query or inject
 * extra OR conditions against other columns. We strip those metacharacters and
 * cap the length. Letters (incl. accents), digits, spaces, hyphens, apostrophes
 * and periods — everything a real org/program name needs — are preserved.
 */
export function sanitizePgrstTerm(input: string): string {
  return input
    .replace(/[,()*:%\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
