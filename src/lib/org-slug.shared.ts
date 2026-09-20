/**
 * Organization Slug and Tenant Disambiguation Helpers
 *
 * Ensures organization names are safely slugified and disambiguated with unique
 * suffixes so two independent clients with identical or similar names are never
 * merged into the same tenant.
 */

export function slugifyOrgName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "org"
  );
}

export async function resolveUniqueOrgSlug(
  name: string,
  isTaken: (candidate: string) => boolean | Promise<boolean>,
  suffixGenerator: () => string = () => Math.random().toString(36).slice(2, 8),
): Promise<string> {
  const base = slugifyOrgName(name);
  const alreadyTaken = await isTaken(base);
  if (!alreadyTaken) {
    return base;
  }

  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    const candidate = `${base}-${suffixGenerator()}`;
    const taken = await isTaken(candidate);
    if (!taken) {
      return candidate;
    }
  }

  return `${base}-${Date.now().toString(36)}`;
}
