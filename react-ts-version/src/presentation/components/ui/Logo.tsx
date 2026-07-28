import { Link } from "react-router-dom";

export function Logo({ className = "", textClassName = "" }: { className?: string, textClassName?: string }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-1.5 select-none ${className}`}>
      <span className={`text-xl font-black font-['Heebo',_'Rubik',_sans-serif] text-slate-900 dark:text-white tracking-tight leading-none ${textClassName}`}>
        מתמטיקאור
      </span>
      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 font-sans">
        ©
      </span>
    </Link>
  );
}
