import React from 'react';
import { Database } from 'lucide-react';

export const SyntheticBadge: React.FC = () => {
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-tint border border-tint-border text-text-primary hover:border-cyan transition-colors cursor-help"
      title="Ambiente local com dados 100% sintéticos gerados para validação analítica. Moeda da origem não validada."
    >
      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
      <Database className="w-3.5 h-3.5 text-primary" strokeWidth={1.6} />
      <span className="text-xs font-medium text-text-primary">
        Dados Sintéticos
      </span>
      <span className="text-xs text-text-muted border-l border-border pl-2 hidden sm:inline">
        DuckDB
      </span>
    </div>
  );
};
