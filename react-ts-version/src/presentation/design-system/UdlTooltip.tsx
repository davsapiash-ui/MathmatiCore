import * as React from 'react';
import { Tooltip } from '@base-ui/react/tooltip';

interface UdlTooltipProps {
  children: React.ReactNode;
  content: string;
}

export function UdlTooltip({ children, content }: UdlTooltipProps) {
  return (
    <Tooltip.Provider delay={300}>
      <Tooltip.Root>
        <Tooltip.Trigger render={children as React.ReactElement} />
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={8}>
            <Tooltip.Popup className="z-50 px-3 py-2 text-sm font-bold text-white bg-slate-800 dark:bg-slate-700 rounded-lg shadow-xl shadow-slate-900/20 backdrop-blur-md animate-in fade-in zoom-in-95 data-[ending-style]:animate-out data-[ending-style]:fade-out data-[ending-style]:zoom-out-95">
              <Tooltip.Arrow className="fill-slate-800 dark:fill-slate-700" />
              {content}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
