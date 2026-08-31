import * as React from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface AccessibleCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const AccessibleCard = React.forwardRef<HTMLDivElement, AccessibleCardProps>(
  ({ className, children, ...props }, ref) => {
    // High contrast defaults
    const highContrastStyles = "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-sm transition-opacity duration-300"

    return (
      <Card
        ref={ref}
        className={cn(highContrastStyles, className)}
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
