import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { DraggableBlock } from "./DraggableBlock";

interface DroppableColumnProps {
  id: "units" | "tens" | "hundreds" | "thousands";
  title: string;
  blocks: { id: string; type: "units" | "tens" | "hundreds" | "thousands" }[];
  isOverCapacity?: boolean;
}

export function DroppableColumn({ id, title, blocks, isOverCapacity = false }: DroppableColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { type: id }
  });

  return (
    <div className="flex flex-col h-full bg-slate-50/80 dark:bg-slate-900/50 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm backdrop-blur-md transition-all">
      <div className="bg-white/90 dark:bg-slate-800/90 py-3 text-center border-b border-slate-200 dark:border-slate-700 backdrop-blur-md">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-lg">{title}</h3>
      </div>
      
      <div 
        ref={setNodeRef}
        className={cn(
          "flex-1 p-6 grid grid-cols-5 grid-rows-2 gap-3 transition-colors relative min-h-[200px] place-items-center place-content-start",
          isOver && "bg-emerald-50/50 dark:bg-emerald-900/20 ring-2 ring-emerald-400 inset-0",
          isOverCapacity && "bg-rose-50/50 dark:bg-rose-900/20 ring-2 ring-rose-400"
        )}
      >
        {/* Render placeholders for ten frame (2x5 grid) */}
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={`placeholder-${index}`} className="w-12 h-12 rounded-md border-2 border-dashed border-slate-300 dark:border-slate-700 opacity-50 absolute pointer-events-none" style={{
            gridColumn: (index % 5) + 1,
            gridRow: Math.floor(index / 5) + 1
          }} />
        ))}
        
        {/* Render actual blocks */}
        {blocks.map((block, index) => (
          <div key={block.id} className="z-10 w-12 h-12" style={{
            gridColumn: (index % 5) + 1,
            gridRow: Math.floor(index / 5) + 1
          }}>
            <DraggableBlock id={block.id} type={block.type} />
          </div>
        ))}
      </div>
    </div>
  );
}
