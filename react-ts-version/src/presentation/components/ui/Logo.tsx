import { Link } from "react-router-dom";

export function Logo({ className = "", textClassName = "" }: { className?: string, textClassName?: string }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-1.5 select-none ${className}`}>
      <span className={`text-2xl font-black font-['Rubik',_'Heebo',_sans-serif] tracking-tight leading-none ${textClassName}`}>
        מתמטיקאור
      </span>
      <span className="text-xs font-bold text-indigo-500/80 dark:text-indigo-400/80 -mt-1 font-sans">
        ©
      </span>
    </Link>
  );
}
