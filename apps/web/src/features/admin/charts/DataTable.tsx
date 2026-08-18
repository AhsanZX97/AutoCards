import type { ReactNode } from 'react';
import { cn } from '../../../lib/cn';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  empty: string;
  /** Rows scroll inside the card rather than stretching it. */
  maxHeight?: string;
}

/** The plain list form. Used where the answer is names, not shapes. */
export function DataTable<T>({ rows, columns, rowKey, empty, maxHeight = '18rem' }: DataTableProps<T>) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">{empty}</p>;
  }

  return (
    <div className="overflow-auto scrollbar-thin" style={{ maxHeight }}>
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-900">
          <tr>
            {columns.map((column) => (
              <th
                key={column.header}
                className={cn('py-2 pr-3 font-medium', column.align === 'right' && 'text-right')}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => (
                <td
                  key={column.header}
                  className={cn(
                    'py-2 pr-3 text-slate-600 dark:text-slate-300',
                    column.align === 'right' && 'text-right tabular-nums',
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
