"use server";

/**
 * Reports where agent prompts actually go, so the UI can say so honestly.
 *
 * The sidebar used to advertise "Local AI stack / 0 cloud tokens" with a
 * tooltip about "$0 cost and data sovereignty" unconditionally — while
 * llm-free.server.ts has been cloud-first for some time. With a Cerebras,
 * Groq or Gemini key set, every agent call sends grant text and the
 * organization profile to that provider before local Ollama is ever tried.
 * Telling a user their data stays on the machine when it does not is the kind
 * of claim that has to be derived from configuration, never hardcoded.
 *
 * Returns provider names only — never key material.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LlmRouteStatus = {
  /** Cloud providers with a key, in the order the chain tries them. */
  cloudProviders: string[];
  /** True when no cloud key is set, so Ollama really is the only destination. */
  localOnly: boolean;
};

export const getLlmRouteStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({}))
  .handler(async (): Promise<LlmRouteStatus> => {
    const cloudProviders = [
      { name: "Cerebras", key: process.env.CEREBRAS_API_KEY },
      { name: "Groq", key: process.env.GROQ_API_KEY },
      { name: "Gemini", key: process.env.GOOGLE_AI_STUDIO_KEY },
    ]
      .filter((p) => !!p.key)
      .map((p) => p.name);

    return { cloudProviders, localOnly: cloudProviders.length === 0 };
  });
