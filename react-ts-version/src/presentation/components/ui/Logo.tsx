import React from "react";
import { Link } from "react-router-dom";

export interface LogoBadgeProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  letter?: string;
}

export function LogoBadge({
  size = "md",
  className = "",
  letter = "מ",
}: LogoBadgeProps) {
  const sizeClasses: Record<string, string> = {
    sm: "w-8 h-8 rounded-xl text-base",
    md: "w-10 h-10 rounded-2xl text-lg",
    lg: "w-12 h-12 rounded-2xl text-2xl",
    xl: "w-14 h-14 rounded-2xl text-3xl",
  };

  return (
    <div
      className={`bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white flex items-center justify-center font-display font-black shadow-lg shadow-indigo-500/25 rotate-[-4deg] shrink-0 select-none ${sizeClasses[size] || sizeClasses.md} ${className}`}
      aria-hidden="true"
    >
      <span className="leading-none select-none">{letter}</span>
    </div>
  );
}

export interface LogoProps {
  className?: string;
  textClassName?: string;
  badgeClassName?: string;
  showBadge?: boolean;
  showText?: boolean;
  subtitle?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  to?: string;
  asTitle?: boolean;
  badge?: React.ReactNode;
}

export function Logo({
  className = "",
  textClassName = "",
  badgeClassName = "",
  showBadge = true,
  showText = true,
  subtitle,
  size = "md",
  to,
  asTitle = false,
  badge,
}: LogoProps) {
  const titleSizeClasses: Record<string, string> = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl sm:text-3xl",
    xl: "text-3xl sm:text-4xl",
  };

  const badgeElement = showBadge ? (
    badge || <LogoBadge size={size} className={badgeClassName} />
  ) : null;

  const textElement = showText ? (
    <div className="flex flex-col text-right leading-tight">
      <div className="inline-flex items-center gap-1.5">
        {asTitle ? (
          <h1
            className={`font-display font-black text-slate-900 dark:text-white tracking-tight leading-none ${titleSizeClasses[size] || titleSizeClasses.md} ${textClassName}`}
          >
            מתמטיקאור
          </h1>
        ) : (
          <span
            className={`font-display font-black text-slate-900 dark:text-white tracking-tight leading-none ${titleSizeClasses[size] || titleSizeClasses.md} ${textClassName}`}
          >
            מתמטיקאור
          </span>
        )}
        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 font-sans">
          &copy;
        </span>
      </div>
      {subtitle && (
        <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
          {subtitle}
        </div>
      )}
    </div>
  ) : null;

  const innerContent = (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {badgeElement}
      {textElement}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-2xl">
        {innerContent}
      </Link>
    );
  }

  return innerContent;
}
