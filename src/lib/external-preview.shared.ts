// Pure, isomorphic guard for the in-app external-link preview feature (see
// external-preview.functions.ts). Fetching a URL server-side on a user click
// is a new SSRF-adjacent surface — even though the URLs come from curated
// grant/funder records rather than raw user input, a bad row (compromised
// discovery source, malicious scrape target) must not be able to make the
// server fetch internal infrastructure. http(s)-only, and rejects loopback /
// private / link-local hosts, including the cloud metadata IP.

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"]);

const BLOCKED_HOST_PATTERNS = [
  /^127\./, // loopback
  /^10\./, // RFC1918
  /^192\.168\./, // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC1918
  /^169\.254\./, // link-local incl. cloud metadata
  /\.local$/i, // mDNS
  /\.internal$/i,
];

export function isSafeExternalUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return false;
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host))) return false;
  return true;
}
