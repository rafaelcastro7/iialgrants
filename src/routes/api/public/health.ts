import { createServerFileRoute } from "@tanstack/react-start/server";
import { healthCheck } from "@/lib/health-check.functions";

export const ServerRoute = createServerFileRoute("/api/public/health").methods({
  GET: async () => {
    const result = await healthCheck({});
    return Response.json(result);
  },
});