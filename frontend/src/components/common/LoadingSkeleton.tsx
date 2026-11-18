import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div
      className={`bg-surface-hover animate-pulse rounded-lg border border-border/60 ${className}`}
      aria-hidden="true"
    />
  );
};

export const CardSkeleton: React.FC<{ height?: string }> = ({ height = 'h-48' }) => {
  return (
    <div className={`bg-surface border border-border rounded-2xl p-6 ${height} flex flex-col justify-between animate-pulse shadow-sm`}>
      <div className="flex justify-between items-center">
        <Skeleton className="w-24 h-4" />
        <Skeleton className="w-8 h-8 rounded-xl" />
      </div>
      <Skeleton className="w-40 h-8" />
      <Skeleton className="w-32 h-4" />
    </div>
  );
};

export const ChartSkeleton: React.FC<{ height?: string }> = ({ height = 'h-80' }) => {
  return (
    <div className={`bg-surface border border-border rounded-2xl p-6 ${height} flex flex-col justify-between animate-pulse shadow-sm`}>
      <div className="flex justify-between items-center mb-6">
        <div className="space-y-2">
          <Skeleton className="w-48 h-5" />
          <Skeleton className="w-32 h-3" />
        </div>
        <Skeleton className="w-20 h-6 rounded-full" />
      </div>
      <div className="flex-1 flex items-end gap-3 pt-6 pb-2">
        {[40, 65, 30, 85, 95, 55, 70, 45, 90, 80, 60, 75].map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-surface-hover rounded-t-md"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between pt-3 border-t border-border/60">
        <Skeleton className="w-16 h-3" />
        <Skeleton className="w-16 h-3" />
        <Skeleton className="w-16 h-3" />
      </div>
    </div>
  );
};
