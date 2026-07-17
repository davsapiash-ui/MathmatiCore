import React, { useState } from 'react';

export function AdditionHelper() {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [clickedCell, setClickedCell] = useState<{ row: number; col: number } | null>(null);

  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  const activeRow = hoveredRow !== null ? hoveredRow : clickedCell?.row ?? null;
  const activeCol = hoveredCol !== null ? hoveredCol : clickedCell?.col ?? null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xl max-w-md w-full animate-in fade-in zoom-in-95 duration-200" dir="rtl">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">לוח עזר לחיבור</h3>
        {activeRow !== null && activeCol !== null ? (
          <div className="bg-ws-accentSoft border border-ws-accent/20 px-3 py-1 rounded-lg text-ws-accent font-black text-lg animate-pulse">
            {activeRow} + {activeCol} = {activeRow + activeCol}
          </div>
        ) : (
          <div className="text-slate-455 dark:text-slate-600 text-sm">עבור עם העכבר או לחץ על תא</div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center table-fixed text-xs font-semibold select-none">
          <thead>
            <tr>
              {/* Top-left empty header cell */}
              <th className="border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold p-1 w-8 h-8">+</th>
              {digits.map((col) => (
                <th
                  key={col}
                  className={`border border-slate-200 dark:border-slate-800 p-1 w-8 h-8 transition-colors ${
                    activeCol === col
                      ? 'bg-ws-accent text-white'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {digits.map((row) => (
              <tr key={row}>
                {/* Row Header */}
                <td
                  className={`border border-slate-200 dark:border-slate-800 p-1 w-8 h-8 font-bold transition-colors ${
                    activeRow === row
                      ? 'bg-ws-accent text-white'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {row}
                </td>
                {digits.map((col) => {
                  const sum = row + col;
                  const isHovered = hoveredRow === row && hoveredCol === col;
                  const isClicked = clickedCell?.row === row && clickedCell?.col === col;
                  const isInActiveLine = activeRow === row || activeCol === col;

                  return (
                    <td
                      key={col}
                      onMouseEnter={() => {
                        setHoveredRow(row);
                        setHoveredCol(col);
                      }}
                      onMouseLeave={() => {
                        setHoveredRow(null);
                        setHoveredCol(null);
                      }}
                      onClick={() => {
                        setClickedCell({ row, col });
                      }}
                      className={`border border-slate-200 dark:border-slate-800 p-1 w-8 h-8 cursor-pointer transition-all duration-150 tabular-nums ${
                        isClicked
                          ? 'bg-orange-500 text-white font-black scale-105 shadow-md shadow-orange-500/20'
                          : isHovered
                          ? 'bg-ws-accent text-white font-bold scale-105 shadow-sm'
                          : isInActiveLine
                          ? 'bg-ws-accentSoft text-ws-accent'
                          : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {sum}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
