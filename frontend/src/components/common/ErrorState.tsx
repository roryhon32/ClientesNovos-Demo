import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Erro ao carregar dados',
  message = 'Não foi possível se comunicar com o backend analítico. Verifique se o serviço está ativo.',
  onRetry,
  className = '',
}) => {
  return (
    <div
      className={`bg-surface border border-negative/30 rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-sm ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-negative/10 border border-negative/25 flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-negative" strokeWidth={1.75} />
      </div>
      <h4 className="text-base font-display font-semibold text-text-primary mb-1.5">{title}</h4>
      <p className="text-xs text-text-muted max-w-md mb-5 leading-relaxed">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-action hover:bg-action-hover dark:border dark:border-cyan/35 text-white transition-all duration-200 shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Tentar novamente</span>
        </button>
      )}
    </div>
  );
};
