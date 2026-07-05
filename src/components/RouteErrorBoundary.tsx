import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface RouteErrorBoundaryProps {
  error: Error;
  reset: () => void;
}

export function RouteErrorBoundary({ error, reset }: RouteErrorBoundaryProps) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <Card className="w-full max-w-md border-destructive/20">
        <CardContent className="space-y-4 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred."}
          </p>
          {process.env.NODE_ENV === "development" && (
            <pre className="max-h-40 overflow-auto rounded bg-muted p-3 text-left text-xs">
              {error.stack}
            </pre>
          )}
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={reset} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: "/dashboard" })}
              className="gap-2"
            >
              <Home className="h-4 w-4" />
              Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
