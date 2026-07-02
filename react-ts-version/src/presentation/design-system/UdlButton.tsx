import * as React from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

export interface UdlButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  semanticColor?: "primary" | "secondary" | "success" | "danger" | "warning" | "neutral";
  isAriaDescribed?: boolean;
  tooltipText?: string;
}

const semanticColorStyles = {
  primary: "bg-primary text-primary-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] shadow-primary/30 hover:shadow-primary/50 hover:bg-primary/90 border border-primary/20",
  secondary: "bg-secondary text-secondary-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)] shadow-sm hover:bg-secondary/80 border border-white/20 dark:border-white/5",
  success: "bg-success text-success-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] shadow-success/30 hover:shadow-success/50 hover:bg-success/90 border border-success/20",
  danger: "bg-destructive text-destructive-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] shadow-destructive/30 hover:shadow-destructive/50 hover:bg-destructive/90 border border-destructive/20",
  warning: "bg-warning text-warning-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] shadow-warning/20 hover:shadow-warning/40 hover:bg-warning/90 border border-warning/20",
  neutral: "bg-white/80 dark:bg-white/5 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-white/10 shadow-sm backdrop-blur-md hover:bg-white dark:hover:bg-white/10 transition-all",
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
        size={props.size}
        className={cn(
          "transition-all duration-300 ease-out active:scale-95", 
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
