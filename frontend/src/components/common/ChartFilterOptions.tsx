import React from 'react';

interface ChartFilterOptionsProps {
  label: string;
  options: { value: string; label: string }[];
  selected?: string | null;
  onSelect: (value: string) => void;
}

/** Keyboard equivalent for chart slices and bars, using the same parent toggle. */
export const ChartFilterOptions: React.FC<ChartFilterOptionsProps> = ({ label, options, selected, onSelect }) => (
  <details className="mt-3 border-t border-border pt-3 text-xs">
    <summary className="cursor-pointer font-medium text-primary hover:underline focus-visible:outline-primary">{label}</summary>
    <p className="text-xs text-text-muted mt-2">Selecione para filtrar. Selecione novamente para remover.</p>
    <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto mt-2 p-1" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={selected === option.value}
          onClick={() => onSelect(option.value)}
          className={`px-2.5 py-1.5 border rounded-lg text-xs text-left break-words max-w-full transition-colors ${selected === option.value ? 'border-action bg-action text-white dark:border-cyan/50 font-semibold' : 'border-border bg-surface-elevated text-text-secondary hover:border-primary/50 hover:text-primary'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </details>
);
