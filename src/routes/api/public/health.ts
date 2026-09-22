import { createFileRoute } from "@tanstack/react-router";
import { healthCheck } from "@/lib/health-check.functions";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const result = await healthCheck({});
        return Response.json(result);
      },
    },
  },
});
