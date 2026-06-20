import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Thin wrapper around evaluateGrantImpl so other serverFns can call the impl
// directly (avoiding TanStack server-fn resolver lookups across handlers).
export const runEvaluator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ grantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { evaluateGrantImpl } = await import("@/agents/evaluator.impl.server");
    return evaluateGrantImpl({
      grantId: data.grantId,
      userId: context.userId,
      userSupabase: context.supabase,
    });
  });
