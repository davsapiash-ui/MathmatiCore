import { Link } from "react-router-dom";

export function Logo({ className = "", textClassName = "" }: { className?: string, textClassName?: string }) {
  return (
    <Link to="/" className={`inline-block select-none ${className}`}>
      <span className={`text-2xl font-black tracking-tight leading-tight transition-colors duration-200 ${textClassName}`}>
        מתמטיקאור
      </span>
    </Link>
  );
}
