import * as React from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useSettingsStore } from "@/application/useSettingsStore"

export interface AccessibleCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /**
   * If true, this card is the current focus of the user's task.
   * In ASD Mode, non-focused cards are dimmed to reduce sensory overload.
   */
  isFocusedTask?: boolean;
}

export const AccessibleCard = React.forwardRef<HTMLDivElement, AccessibleCardProps>(
  ({ className, isFocusedTask = true, children, ...props }, ref) => {
    const isASDMode = useSettingsStore((state) => state.isASDMode)

    // In ASD Mode: if not the focused task, drop opacity and remove transitions
    const asdStyles = isASDMode && !isFocusedTask 
      ? "opacity-30 grayscale saturate-0 pointer-events-none transition-none" 
      : "transition-opacity duration-300"

    // High contrast defaults
    const highContrastStyles = "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-sm"

    return (
      <Card
        ref={ref}
        className={cn(highContrastStyles, asdStyles, className)}
        {...props}
      >
        {children}
      </Card>
    )
  }
)
AccessibleCard.displayName = "AccessibleCard"

// Re-export sub-components for convenience if needed, but with standard Shadcn styling
export { CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
