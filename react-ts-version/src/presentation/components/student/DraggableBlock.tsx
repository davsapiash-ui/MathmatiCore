import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

interface DraggableBlockProps {
  id: string;
  type: "units" | "tens" | "hundreds" | "thousands";
  disabled?: boolean;
}

export function DraggableBlock({ id, type, disabled = false }: DraggableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { type },
    disabled,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  // Visual representation based on type
  const baseClasses = "rounded-md border-2 cursor-grab active:cursor-grabbing shadow-sm select-none transition-opacity";
  let blockClasses = "";
  let label = "";

  switch (type) {
    case "units":
      blockClasses = "w-8 h-8 bg-blue-100 border-blue-400 text-blue-800 flex items-center justify-center font-bold text-sm";
      label = "1";
      break;
    case "tens":
      blockClasses = "w-8 h-32 bg-green-100 border-green-400 flex flex-col justify-around items-center";
      break;
    case "hundreds":
      blockClasses = "w-32 h-32 bg-red-100 border-red-400 grid grid-cols-10 grid-rows-10";
      break;
    case "thousands":
      blockClasses = "w-32 h-32 bg-purple-100 border-purple-400 shadow-[8px_8px_0_0_rgba(168,85,247,0.4)]";
      break;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(baseClasses, blockClasses, isDragging ? "opacity-50 z-50 scale-105" : "opacity-100 relative")}
      aria-label={`${type} block`}
    >
      {type === "units" && label}
      {type === "tens" && Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="w-full h-px bg-green-300/50" />
      ))}
      {type === "hundreds" && Array.from({ length: 100 }).map((_, i) => (
        <div key={i} className="border-[0.5px] border-red-300/30" />
      ))}
    </div>
  );
}
