import * as React from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface ColumnDef<T> {
  key: Extract<keyof T, string>;
  header: string;
  render?: (value: T[Extract<keyof T, string>], item: T) => React.ReactNode;
  align?: "left" | "center" | "right";
}

export interface DataGridProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
}

export function DataGrid<T extends { id?: string | number }>({ 
  data, 
  columns, 
  emptyMessage = "אין נתונים להצגה",
  onRowClick
}: DataGridProps<T>) {
  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
          <TableRow>
            {columns.map((col) => (
              <TableHead 
                key={col.key} 
                className={`font-semibold text-slate-700 dark:text-slate-300 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((item, index) => (
              <TableRow 
                key={item.id ?? index}
                onClick={() => onRowClick && onRowClick(item)}
                className={onRowClick ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" : ""}
              >
                {columns.map((col) => (
                  <TableCell 
                    key={col.key}
                    className={`${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}
                  >
                    {col.render ? col.render(item[col.key], item) : String(item[col.key])}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
