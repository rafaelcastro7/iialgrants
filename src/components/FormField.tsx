import {
  type FieldPath,
  type FieldValues,
  useController,
  type UseControllerProps,
} from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface FormFieldProps<T extends FieldValues> extends UseControllerProps<T> {
  label?: string;
  placeholder?: string;
  type?: "text" | "email" | "number" | "password" | "url";
  description?: string;
  className?: string;
  inputClassName?: string;
  as?: "input" | "textarea";
}

export function FormField<T extends FieldValues>({
  label,
  placeholder,
  type = "text",
  description,
  className,
  inputClassName,
  as = "input",
  ...props
}: FormFieldProps<T>) {
  const {
    field,
    fieldState: { error },
  } = useController(props);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={props.name} className={error ? "text-destructive" : ""}>
          {label}
        </Label>
      )}
      {as === "textarea" ? (
        <Textarea
          {...field}
          id={props.name}
          placeholder={placeholder}
          className={cn(error && "border-destructive", inputClassName)}
        />
      ) : (
        <Input
          {...field}
          id={props.name}
          type={type}
          placeholder={placeholder}
          className={cn(error && "border-destructive", inputClassName)}
        />
      )}
      {description && !error && <p className="text-xs text-muted-foreground">{description}</p>}
      {error && <p className="text-xs text-destructive">{error.message}</p>}
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
