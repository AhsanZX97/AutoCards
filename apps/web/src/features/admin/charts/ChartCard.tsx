import { useState, type ReactNode } from 'react';
import { Card, CardBody } from '../../../components/ui';
import { cn } from '../../../lib/cn';

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

interface ChartCardProps {
  title: string;
  /** One line on how to read the chart, or what the number does not include. */
  subtitle?: string;
  /**
   * The same values as a table. Every chart here has one: a tooltip enhances a
   * chart, it never gates it, and hovering is not available to everybody.
   */
  table?: ChartTable;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, table, right, className, children }: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardBody className="flex flex-1 flex-col">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {right}
            {table && (
              <button
                type="button"
                onClick={() => setShowTable((v) => !v)}
                aria-pressed={showTable}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                {showTable ? 'Chart' : 'Table'}
              </button>
            )}
          </div>
        </div>
        <div className="flex-1">{showTable && table ? <ValueTable table={table} /> : children}</div>
      </CardBody>
    </Card>
  );
}

function ValueTable({ table }: { table: ChartTable }) {
  return (
    <div className="max-h-72 overflow-auto scrollbar-thin">
      <table className="w-full text-left text-sm tabular-nums">
        <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-900">
          <tr>
            {table.columns.map((column, index) => (
              <th key={column} className={cn('py-2 pr-3 font-medium', index > 0 && 'text-right')}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    'py-1.5 pr-3',
                    cellIndex === 0
                      ? 'text-slate-600 dark:text-slate-300'
                      : 'text-right font-medium text-slate-800 dark:text-slate-200',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
