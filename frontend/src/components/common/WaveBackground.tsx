import React from 'react';

interface WaveBackgroundProps {
  className?: string;
  intensity?: 'subtle' | 'medium';
}

export const WaveBackground: React.FC<WaveBackgroundProps> = ({
  className = '',
  intensity = 'subtle',
}) => {
  const opacity = intensity === 'medium' ? '0.28' : '0.18';

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <svg
        className="w-full h-full object-cover"
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="waveBrand" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5787cf" stopOpacity={opacity} />
            <stop offset="60%" stopColor="#123063" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#0a1f3d" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path
          d="M-50,300 C80,250 150,380 280,290 C360,240 380,320 450,280"
          stroke="url(#waveBrand)"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M-50,280 C60,230 160,360 270,270 C350,210 390,300 450,250"
          stroke="url(#waveBrand)"
          strokeWidth="1.1"
          strokeDasharray="4 6"
          fill="none"
        />
        <path
          d="M-50,340 C90,300 170,390 290,320 C370,270 410,340 450,310"
          stroke="url(#waveBrand)"
          strokeWidth="1.6"
          fill="none"
        />
        <path
          d="M-30,250 C100,210 180,330 300,240 C380,180 400,270 450,220"
          stroke="url(#waveBrand)"
          strokeWidth="0.9"
          fill="none"
        />
      </svg>
    </div>
  );
};
