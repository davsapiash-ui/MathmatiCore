import { useState } from 'react';

export function AdditionHelper() {
  const [activeRow, setActiveRow] = useState<number | null>(null);
  const [activeCol, setActiveCol] = useState<number | null>(null);

  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  const handleCellClick = (row: number, col: number) => {
    // Cognitive step logic: First select row, then column
    if (activeRow === null) {
      setActiveRow(row);
    } else if (activeRow === row && activeCol === null) {
      setActiveCol(col);
    } else {
      // Reset if already fully selected or clicking outside active line
      setActiveRow(row);
      setActiveCol(null);
    }
  };

  const handleRowHeaderClick = (row: number) => {
    setActiveRow(row);
    setActiveCol(null);
  };

  const handleColHeaderClick = (col: number) => {
    if (activeRow !== null) {
      setActiveCol(col);
    } else {
      setActiveCol(col);
      setActiveRow(null);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xl max-w-md w-full animate-in fade-in zoom-in-95 duration-200" dir="rtl">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">לוח עזר לחיבור</h3>
        {activeRow !== null && activeCol !== null ? (
          <div className="bg-ws-accentSoft border border-ws-accent/20 px-3 py-1 rounded-lg text-ws-accent font-black text-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
            {activeRow} + {activeCol} = {activeRow + activeCol}
          </div>
        ) : (
          <div className="text-slate-400 dark:text-slate-600 text-sm">
            {activeRow === null ? "לחץ על שורה כדי להתחיל" : "כעת בחר עמודה"}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center table-fixed text-xs font-semibold select-none">
          <thead>
            <tr>
              <th className="border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold p-1 w-8 h-8">+</th>
              {digits.map((col) => (
                <th
                  key={col}
                  onClick={() => handleColHeaderClick(col)}
                  className={`border border-slate-200 dark:border-slate-800 p-1 w-8 h-8 transition-colors cursor-pointer ${
                    activeCol === col
                      ? 'bg-ws-accent text-white'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
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
                <td
                  onClick={() => handleRowHeaderClick(row)}
                  className={`border border-slate-200 dark:border-slate-800 p-1 w-8 h-8 font-bold transition-colors cursor-pointer ${
                    activeRow === row
                      ? 'bg-ws-accent text-white'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {row}
                </td>
                {digits.map((col) => {
                  const sum = row + col;
                  const isIntersection = activeRow === row && activeCol === col;
                  const isInActiveRow = activeRow === row;
                  const isInActiveCol = activeCol === col;
                  const isInActiveLine = isInActiveRow || isInActiveCol;

                  return (
                    <td
                      key={col}
                      onClick={() => handleCellClick(row, col)}
                      className={`border border-slate-200 dark:border-slate-800 p-1 w-8 h-8 cursor-pointer transition-all duration-300 tabular-nums ${
                        isIntersection
                          ? 'bg-orange-500 text-white font-black scale-105 shadow-md shadow-orange-500/20 opacity-100'
                          : isInActiveLine
                          ? 'bg-ws-accentSoft text-ws-accent opacity-90'
                          : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 opacity-40'
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
