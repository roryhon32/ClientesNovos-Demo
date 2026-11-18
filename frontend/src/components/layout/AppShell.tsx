import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const AppShell: React.FC = () => {
  return (
    <div className="app-shell min-h-screen bg-background text-text-primary flex relative selection:bg-primary/20 selection:text-primary">
      {/* Subtle institutional navy radial wash */}
      <div
        className="app-ambient fixed top-0 left-0 right-0 h-72 pointer-events-none opacity-65 bg-[radial-gradient(ellipse_at_top,_rgba(87,135,207,0.09)_0%,_transparent_70%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(87,135,207,0.16)_0%,_transparent_70%)]"
        aria-hidden="true"
      />

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area (extra top padding on mobile for menu bar clearance) */}
      <div className="app-main flex-1 flex flex-col min-h-screen min-w-0">
        <main className="flex-1 min-w-0 px-4 pb-6 pt-16 sm:px-6 lg:p-6 max-w-[1800px] w-full mx-auto relative z-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
