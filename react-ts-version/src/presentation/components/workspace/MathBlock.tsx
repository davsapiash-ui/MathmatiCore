import { useDraggable } from '@dnd-kit/core';
import { UdlTooltip } from '@/presentation/design-system/UdlTooltip';

interface MathBlockProps {
  id: string;
  type: 'one' | 'ten' | 'hundred' | 'thousand';
  isOverlay?: boolean;
}

export function MathBlock({ id, type, isOverlay }: MathBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: id,
    data: { type },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  // Visuals for different block types
  const isTen = type === 'ten';
  const isHundred = type === 'hundred';
  const isThousand = type === 'thousand';

  let widthClass = 'w-8';
  let heightClass = 'h-8';
  let bgClass = 'bg-amber-400 shadow-amber-400/50';
  let tooltipText = "יחידה (ניתן לחבר עשר יחידות לעשרת)";
  let ariaLabel = "בדיד יחידה";

  if (isTen) {
    widthClass = 'w-4';
    heightClass = 'h-32';
    bgClass = 'bg-indigo-500 shadow-indigo-500/50';
    tooltipText = "עשרת (ניתן לפרוט ליחידות או לחבר למאה)";
    ariaLabel = "בדיד עשרת";
  } else if (isHundred) {
    widthClass = 'w-32';
    heightClass = 'h-32';
    bgClass = 'bg-emerald-500 shadow-emerald-500/50';
    tooltipText = "מאה (ניתן לפרוט לעשרות או לחבר לאלף)";
    ariaLabel = "בדיד מאה";
  } else if (isThousand) {
    widthClass = 'w-32';
    heightClass = 'h-32';
    bgClass = 'bg-rose-500 shadow-rose-500/50 scale-[1.1] border-b-4 border-r-4 border-rose-700'; // simulated 3D cube
    tooltipText = "אלף (ניתן לפרוט למאות)";
    ariaLabel = "בדיד אלף";
  }

  return (
    <UdlTooltip content={tooltipText}>
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={`
          ${widthClass} ${heightClass} ${bgClass} 
          rounded-sm shadow-lg border border-white/20
          cursor-grab active:cursor-grabbing
          transition-opacity duration-200
          hover:scale-105 active:scale-110 active:z-50
          ${isDragging && !isOverlay ? 'opacity-30' : 'opacity-100'}
          flex items-center justify-center
        `}
        aria-label={ariaLabel}
      >
        {/* Decorative lines to make it look like base-10 blocks */}
        {isTen && (
          <div className="flex flex-col justify-evenly h-full w-full opacity-30">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="w-full h-[1px] bg-white"></div>
            ))}
          </div>
        )}
        {isHundred && (
          <div className="grid grid-cols-10 grid-rows-10 h-full w-full opacity-30">
            {[...Array(100)].map((_, i) => (
              <div key={i} className="border-[0.5px] border-white"></div>
            ))}
          </div>
        )}
        {isThousand && (
          <div className="flex items-center justify-center h-full w-full opacity-40 text-4xl font-black text-white">
            1k
          </div>
        )}
      </div>
    </UdlTooltip>
  );
}
