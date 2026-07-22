"use server";

// Detects login/registration walls in scraped funder content so a gated
// source is tracked for a human to sign up manually, instead of silently
// disappearing into a generic "fetch failed" / "page too short" discovery
// skip that looks identical to every other kind of failure.
//
// This module NEVER creates accounts on any external site. Detection and
// tracking only — a human decides whether and how to register, and marks
// the gate resolved from the admin Sources page once they have.

import type { SupabaseClient } from "@supabase/supabase-js";

const WALL_URL_PATTERNS: RegExp[] = [
  /\/(login|log-in|signin|sign-in|register|signup|sign-up)(\/|$|\?)/i,
  /\/(connexion|inscription|se-connecter|creer-un-compte)(\/|$|\?)/i,
  /\/account\/(login|register)\b/i,
  /\/auth\/(login|signin)\b/i,
];

const WALL_TEXT_PATTERNS: RegExp[] = [
  /\bsign in to (view|access|continue)\b/i,
  /\bplease log ?in to\b/i,
  /\byou (must|need to) (be logged in|log in|sign in)\b/i,
  /\bcreate a (free )?account to (access|view|continue)\b/i,
  /\bmembers? only\b[\s\S]{0,60}\b(log ?in|sign ?in)\b/i,
  /\bconnectez[- ]vous pour\b/i,
  /\bcr[ée]ez un compte( gratuit)? pour\b/i,
  /\bvous devez (être connect[ée]|vous connecter)\b/i,
  /\bregistration (is )?required\b/i,
  /\binscription requise\b/i,
];

export type RegistrationWallResult =
  | { blocked: true; reason: "redirected_to_login_url" | "login_wall_text"; snippet: string }
  | { blocked: false };

// Pure and synchronous so it's trivially unit-testable — takes the already-
// fetched content and the URL that was actually served (post-redirect), not
// a live network call.
export function detectRegistrationWall(
  content: string,
  finalUrl: string,
): RegistrationWallResult {
  for (const re of WALL_URL_PATTERNS) {
    if (re.test(finalUrl)) {
      return { blocked: true, reason: "redirected_to_login_url", snippet: finalUrl };
    }
  }
  const text = (content || "").slice(0, 4000);
  for (const re of WALL_TEXT_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const start = Math.max(0, (m.index ?? 0) - 40);
      return {
        blocked: true,
        reason: "login_wall_text",
        snippet: text
          .slice(start, start + 160)
          .replace(/\s+/g, " ")
          .trim(),
      };
    }
  }
  return { blocked: false };
}

// Upsert-by-hand (funder_id + url is unique): repeated detections accumulate
// evidence (times_seen, last_detected_at) rather than create duplicate rows
// or silently overwrite the first sighting.
export async function recordRegistrationGate(
  supabase: SupabaseClient,
  args: { funderId: string | null; url: string; reason: string; snippet?: string },
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: existing } = await supabase
    .from("discovery_registration_gates")
    .select("id, times_seen")
    .eq("funder_id", args.funderId)
    .eq("url", args.url)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("discovery_registration_gates")
      .update({
        last_detected_at: nowIso,
        times_seen: ((existing as { times_seen?: number }).times_seen ?? 1) + 1,
        reason: args.reason,
        snippet: args.snippet ?? null,
      } as never)
      .eq("id", (existing as { id: string }).id);
    return;
  }
  await supabase.from("discovery_registration_gates").insert({
    funder_id: args.funderId,
    url: args.url,
    reason: args.reason,
    snippet: args.snippet ?? null,
  } as never);
}
