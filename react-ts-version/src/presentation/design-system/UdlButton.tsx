import * as React from "react"
import { Button, ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface UdlButtonProps extends ButtonProps {
  semanticColor?: "primary" | "secondary" | "success" | "danger" | "warning" | "neutral";
  isAriaDescribed?: boolean;
  tooltipText?: string;
}

const semanticColorStyles = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  secondary: "bg-purple-600 text-white hover:bg-purple-700",
  success: "bg-green-600 text-white hover:bg-green-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  warning: "bg-yellow-500 text-black hover:bg-yellow-600",
  neutral: "bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
}

export const UdlButton = React.forwardRef<HTMLButtonElement, UdlButtonProps>(
  ({ className, semanticColor = "primary", variant, isAriaDescribed: _isAriaDescribed, tooltipText, children, ...props }, ref) => {
    // Determine the base styles
    // If a variant is explicitly passed (e.g. outline, ghost), we rely on Shadcn styles
    // Otherwise, we enforce our high-contrast semantic colors for UDL
    const colorClass = variant ? "" : semanticColorStyles[semanticColor]
    
    // UDL accessible focus states: clear, high-contrast outlines for screen readers and keyboard navigation
    const focusClass = "focus-visible:ring-4 focus-visible:ring-offset-2 focus-visible:ring-blue-500/50"

    return (
      <Button
        ref={ref}
        variant={variant}
        className={cn(
          "transition-all duration-200 active:scale-95", 
          colorClass, 
          focusClass, 
          className
        )}
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
