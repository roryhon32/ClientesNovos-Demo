import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Nenhum dado encontrado',
  message = 'Não há registros para os filtros selecionados ou para o período atual.',
  icon,
  action,
  className = '',
}) => {
  return (
    <div
      className={`bg-surface border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-sm ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 text-primary">
        {icon || <Inbox className="w-6 h-6 text-primary" strokeWidth={1.6} />}
      </div>
      <h4 className="text-sm font-display font-semibold text-text-primary mb-1">{title}</h4>
      <p className="text-xs text-text-muted max-w-sm mb-4 leading-relaxed">{message}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
