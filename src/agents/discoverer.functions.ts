import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Thin serverFn wrapper. Real logic lives in discoverer.impl.server.ts so it
// can also be invoked directly from other server contexts (orchestrators,
// webhooks) WITHOUT going through the TanStack server-fn resolver — which
// throws "Server function info not found" when called from another handler.
export const runDiscoverer = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ funderId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { discoverFunderImpl } = await import("@/agents/discoverer.impl.server");
    return discoverFunderImpl(data.funderId);
  });
