import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

export function useGsapPageEntrance() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // Check prefers-reduced-motion
      if (
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return;
      }

      const el = containerRef.current;
      if (!el) return;

      const ctx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.45 } });

        const headers = el.querySelectorAll('.gsap-header');
        if (headers.length > 0) {
          tl.fromTo(
            headers,
            { opacity: 0, y: -10 },
            { opacity: 1, y: 0, duration: 0.35 }
          );
        }

        const kpis = el.querySelectorAll('.gsap-kpi');
        if (kpis.length > 0) {
          tl.fromTo(
            kpis,
            { opacity: 0, y: 15 },
            { opacity: 1, y: 0, stagger: 0.08, duration: 0.4 },
            headers.length > 0 ? '-=0.2' : 0
          );
        }

        const charts = el.querySelectorAll('.gsap-chart');
        if (charts.length > 0) {
          tl.fromTo(
            charts,
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, stagger: 0.1, duration: 0.45 },
            '-=0.2'
          );
        }

        const sections = el.querySelectorAll('.gsap-section');
        if (sections.length > 0) {
          tl.fromTo(
            sections,
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, stagger: 0.1, duration: 0.45 },
            '-=0.2'
          );
        }
      }, containerRef);

      return () => ctx.revert();
    },
    { scope: containerRef, dependencies: [] }
  );

  return containerRef;
}
