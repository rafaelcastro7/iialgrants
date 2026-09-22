"use server";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRuntimeStatus } from "./env-detect.server";

/**
 * Health check endpoint for Lovable and monitoring.
 * Returns runtime environment, Ollama reachability, and cloud key status.
 * No auth required — safe to expose publicly.
 */
export const healthCheck = createServerFn({ method: "GET" })
  .inputValidator(z.object({}))
  .handler(async () => {
    const status = await getRuntimeStatus();
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: status.env,
      ollama: {
        reachable: status.ollamaReachable,
        url: status.ollamaUrl,
      },
      cloudLLMs: {
        configured: status.hasCloudKeys,
      },
      supabase: {
        url: status.supabaseUrl,
      },
    };
  });
