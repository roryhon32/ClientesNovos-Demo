import React from 'react';
import { Zap, ArrowRight } from 'lucide-react';
import { WaveBackground } from './WaveBackground';

interface ContextualInsightCardProps {
  title?: string;
  insightText: string;
  detailText?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const ContextualInsightCard: React.FC<ContextualInsightCardProps> = ({
  title = 'Destaque do período',
  insightText,
  detailText,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`relative bg-gradient-to-br from-[#0a1f3d] via-[#0d264b] to-[#123063] dark:from-[#0e264a] dark:via-[#112f5c] dark:to-[#173e78] border border-[#0a1f3d] dark:border-[#244e8c] rounded-2xl p-5 overflow-hidden flex flex-col justify-between gap-5 transition-all duration-300 shadow-md text-white ${className}`}
    >
      {/* Decorative Wave in Background */}
      <WaveBackground intensity="medium" className="opacity-45" />

      {/* Content */}
      <div className="relative z-10">
        {/* Top Icon Box */}
        <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center mb-4 shadow-sm">
          <Zap className="w-5 h-5 text-accent" strokeWidth={1.85} />
        </div>

        <span className="text-xs font-display uppercase font-bold tracking-wider text-accent mb-2 block">
          {title}
        </span>

        {/* Large Insight Text */}
        <p className="text-base sm:text-lg font-display font-semibold text-white leading-snug tracking-tight">
          {insightText}
        </p>

        {detailText && (
          <p className="text-xs text-[#d6e2f5] mt-2.5 leading-relaxed">
            {detailText}
          </p>
        )}
      </div>

      {/* Action Arrow Button */}
      <div className="relative z-10 pt-3 border-t border-white/15 flex items-center justify-between">
        {actionLabel ? (
          <button
            onClick={onAction}
            className="inline-flex items-center gap-2 text-xs font-semibold text-accent hover:text-white transition-colors"
          >
            <span>{actionLabel}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={onAction}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-accent hover:text-[#0a1f3d] border border-white/20 flex items-center justify-center text-white transition-all duration-200"
            aria-label="Ver mais detalhes"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
