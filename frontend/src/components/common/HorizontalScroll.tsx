import React, { useEffect, useId, useRef, useState } from 'react';

interface HorizontalScrollProps {
  children: React.ReactNode;
  className?: string;
  label?: string;
}

/** Keep a table's horizontal controls next to its header as well as its last row. */
export const HorizontalScroll: React.FC<HorizontalScrollProps> = ({ children, className = '', label = 'Tabela' }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const id = useId();

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const width = content.scrollWidth;
      setOverflowing(width > content.clientWidth + 1);
      if (widthRef.current) widthRef.current.style.width = `${width}px`;
      if (topRef.current) topRef.current.scrollLeft = content.scrollLeft;
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(content);
    if (content.firstElementChild) observer?.observe(content.firstElementChild);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [children]);

  const synchronize = (from: HTMLDivElement, to: HTMLDivElement | null) => {
    if (to && Math.abs(to.scrollLeft - from.scrollLeft) > 1) to.scrollLeft = from.scrollLeft;
  };

  return (
    <div className={`horizontal-scroll ${className}`}>
      <div
        ref={topRef}
        className="horizontal-scroll-top"
        role="region"
        aria-label={`${label}: rolagem horizontal superior`}
        aria-controls={id}
        tabIndex={overflowing ? 0 : -1}
        hidden={!overflowing}
        onScroll={(event) => synchronize(event.currentTarget, contentRef.current)}
      >
        <div ref={widthRef} className="horizontal-scroll-spacer" />
      </div>
      <div
        id={id}
        ref={contentRef}
        className="horizontal-scroll-content"
        role="region"
        aria-label={`${label}: conteúdo com rolagem horizontal`}
        tabIndex={overflowing ? 0 : undefined}
        onScroll={(event) => synchronize(event.currentTarget, topRef.current)}
      >
        {children}
      </div>
    </div>
  );
};
