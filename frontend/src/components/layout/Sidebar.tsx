import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  UserPlus,
  Users,
  GitFork,
  Activity,
  Menu,
  X,
  Package,
} from 'lucide-react';
import brandEmblem from '../../assets/brand-emblem.png';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/overview', label: 'Visão Geral', icon: LayoutDashboard },
  { to: '/acquisition', label: 'Novos Clientes', icon: UserPlus },
  { to: '/customers', label: 'Clientes', icon: Users },
  { to: '/products', label: 'Produtos e Recompra', icon: Package },
  { to: '/retention', label: 'Retenção e Cohort', icon: GitFork },
  { to: '/lifecycle', label: 'Ciclo de Vida', icon: Activity },
];

const GLOBAL_FILTER_KEYS = new Set([
  'start_date', 'end_date', 'company', 'business_unit', 'seller', 'state', 'city',
  'sales_channel', 'customer_status', 'acquisition_cohort',
  'valid_purchases_gt',
]);

export const Sidebar: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { search } = useLocation();
  const navigationSearch = new URLSearchParams(
    [...new URLSearchParams(search)].filter(([key]) => GLOBAL_FILTER_KEYS.has(key)),
  ).toString();

  return (
    <>
      {/* Mobile Top Bar (Android / iOS responsive navigation bar) */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-gradient-to-r from-[#0a1f3d] to-[#123063] border-b border-white/15 px-4 flex items-center justify-between shadow-md">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors"
          aria-label="Abrir menu lateral"
          aria-expanded={mobileOpen}
          aria-controls="main-sidebar"
        >
          {mobileOpen ? <X className="w-5 h-5 text-accent" /> : <Menu className="w-5 h-5" />}
        </button>
        <div className="flex items-center gap-2.5">
          <div className="bg-white rounded-lg p-1 shadow-sm inline-flex items-center justify-center">
            <img src={brandEmblem} alt="Customer Intelligence" className="h-6 w-6 object-contain rounded" />
          </div>
          <span className="font-display font-bold text-sm text-white tracking-tight">
            Customer Intel
          </span>
        </div>
      </div>

      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-[#050e1c]/60 backdrop-blur-sm transition-opacity"
        />
      )}

      {/* Sidebar Container (Institutional Dark Blue) */}
      <aside
        id="main-sidebar"
        className={`app-sidebar fixed top-0 bottom-0 left-0 z-40 bg-gradient-to-b from-[#123063] via-[#0e2650] to-[#0a1f3d] dark:from-[#0c2144] dark:via-[#081731] dark:to-[#050e1c] text-white border-r border-[#0a1f3d]/40 dark:border-[#1c3863] flex flex-col justify-between shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Brand Section */}
        <div className="p-4 overflow-y-auto">
          <div className="mb-7 flex items-center gap-3 px-1">
            <div className="bg-white rounded-xl p-1.5 w-11 h-11 shrink-0 shadow-sm inline-flex items-center justify-center">
              <img
                src={brandEmblem}
                alt="Customer Intelligence"
                className="w-full h-full object-contain rounded-lg"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 leading-tight">
                <span className="font-display font-bold text-base tracking-tight text-white">
                  Customer
                </span>
                <span className="font-display font-bold text-base text-accent">
                  Intel
                </span>
              </div>
              <p className="text-xs text-[#c7d5eb] tracking-wide font-medium mt-0.5 truncate">
                Analytics Suite · B2B
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5" aria-label="Menu principal">
            <div className="text-xs font-display font-semibold tracking-wider uppercase text-[#9db3d8] px-3 mb-2">
              Menu Analítico
            </div>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={{ pathname: item.to, search: navigationSearch ? `?${navigationSearch}` : '' }}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 relative group ${
                      isActive
                        ? 'bg-white/15 text-white border border-white/25 shadow-sm font-semibold'
                        : 'text-[#d8e3f5] hover:text-white hover:bg-white/10'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-accent" />
                      )}
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive
                            ? 'text-accent'
                            : 'text-[#9db3d8] group-hover:text-white'
                        }`}
                        strokeWidth={1.75}
                      />
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Bottom Environment Footer */}
        <div className="relative p-4 border-t border-white/15 bg-[#0a1f3d]/85 dark:bg-[#050e1c]/90 shrink-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
            <span className="text-xs text-white/95 font-medium leading-snug">
              Painel Analítico B2B
            </span>
          </div>
          <p className="text-xs text-[#9db3d8]">
            Versão 1.0 • Histórico 2020–2026
          </p>
        </div>
      </aside>
    </>
  );
};
