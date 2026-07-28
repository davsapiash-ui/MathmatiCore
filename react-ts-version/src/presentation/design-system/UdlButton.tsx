import * as React from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

export interface UdlButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  semanticColor?: "primary" | "secondary" | "success" | "danger" | "warning" | "neutral" | "unit" | "ten" | "hundred" | "thousand";
  isAriaDescribed?: boolean;
  tooltipText?: string;
}

const semanticVariantMap: Record<string, "default" | "udl" | "secondary" | "destructive" | "placeValueUnit" | "placeValueTen" | "placeValueHundred" | "placeValueThousand" | "outline"> = {
  primary: "udl",
  secondary: "secondary",
  success: "udl",
  danger: "destructive",
  warning: "udl",
  neutral: "outline",
  unit: "placeValueUnit",
  ten: "placeValueTen",
  hundred: "placeValueHundred",
  thousand: "placeValueThousand",
}

export const UdlButton = React.forwardRef<HTMLButtonElement, UdlButtonProps>(
  ({ className, semanticColor = "primary", variant, isAriaDescribed: _isAriaDescribed, tooltipText, children, ...props }, ref) => {
    const resolvedVariant = variant || semanticVariantMap[semanticColor] || "udl";

    return (
      <Button
        ref={ref}
        variant={resolvedVariant}
        size={props.size}
        className={cn(className)}
        aria-label={typeof children === "string" ? children : undefined}
        title={tooltipText}
        {...props}
      >
        {children}
      </Button>
    )
  }
)
UdlButton.displayName = "UdlButton"
