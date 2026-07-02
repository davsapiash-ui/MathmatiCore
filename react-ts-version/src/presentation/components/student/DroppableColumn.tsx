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
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900/50 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
      <div className="bg-slate-200 dark:bg-slate-800 py-3 text-center border-b border-slate-300 dark:border-slate-700">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-lg">{title}</h3>
      </div>
      
      <div 
        ref={setNodeRef}
        className={cn(
          "flex-1 p-4 flex flex-wrap content-start gap-2 overflow-y-auto transition-colors",
          isOver && "bg-blue-50/50 dark:bg-blue-900/20 ring-2 ring-blue-400 inset-0",
          isOverCapacity && "bg-yellow-50/50 dark:bg-yellow-900/20 ring-2 ring-yellow-400"
        )}
      >
        {blocks.map((block) => (
          <DraggableBlock key={block.id} id={block.id} type={block.type} />
        ))}
      </div>
    </div>
  );
}
