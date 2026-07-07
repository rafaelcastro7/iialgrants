import { type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label?: string;
  error?: string;
  description?: string;
  className?: string;
  children?: ReactNode;
  htmlFor?: string;
}

export function FormField({
  label,
  error,
  description,
  className,
  children,
  htmlFor,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor} className={error ? "text-destructive" : ""}>
          {label}
        </Label>
      )}
      {children}
      {description && !error && <p className="text-xs text-muted-foreground">{description}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface FormErrorProps {
  message?: string;
}

export function FormError({ message }: FormErrorProps) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}
