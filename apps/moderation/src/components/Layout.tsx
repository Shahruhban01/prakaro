import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  FileCheck2,
  ListTodo,
  ShieldCheck,
  AlertTriangle,
  Users,
  BarChart3,
  Sparkles,
  ShieldAlert,
  History,
  LogOut,
  ParkingCircle,
  Menu,
  X,
} from 'lucide-react';
import type { Actor } from '../api';
import { useData, api } from '../api';
import axios from 'axios';

export const Layout: React.FC = () => {
  const { data: session, isLoading, isError } = useData<Actor>('/session');
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await Promise.allSettled([
        axios.post('/api/moderator-auth/sign-out', {}, { headers: { 'X-Prakaro-Console': '1' }, withCredentials: true }),
        axios.post('/api/super-admin-auth/sign-out', {}, { headers: { 'X-Prakaro-Console': '1' }, withCredentials: true }),
        axios.post('/api/auth/sign-out', {}, { headers: { 'X-Prakaro-Console': '1' }, withCredentials: true }),
      ]);
    } catch {
      // ignore
    }
    sessionStorage.removeItem('prakaro_auth_token');
    delete api.defaults.headers.common['Authorization'];
    navigate('/login');
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Loading moderation workspace...</p>
        </div>
      </div>
    );
  }

  if (isError || !session) {
    navigate('/login');
    return null;
  }

  const isSuperAdmin = session.superAdmin === true || session.role === 'SUPER_ADMIN';
  const isModAdmin = session.admin || isSuperAdmin;
  const isQA = session.role === 'QA_REVIEWER' || isModAdmin;
  const isSupervisor =
    session.role === 'SUPERVISOR' || session.role === 'MODERATION_MANAGER' || isModAdmin;
  const isReviewer = [
    'MODERATOR',
    'SUPERVISOR',
    'MODERATION_MANAGER',
    'QA_REVIEWER',
    'ADMIN',
    'MODERATION_ADMIN',
    'SUPER_ADMIN',
  ].includes(session.role);

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/queues', label: 'Queues', icon: Layers },
    ...(isReviewer ? [{ to: '/cases', label: 'Cases', icon: FileCheck2 }] : []),
    ...(isReviewer ? [{ to: '/my-tasks', label: 'My Tasks', icon: ListTodo }] : []),
    ...(isQA ? [{ to: '/qa', label: 'Quality Assurance', icon: ShieldCheck }] : []),
    ...(isSupervisor ? [{ to: '/escalations', label: 'Escalations', icon: AlertTriangle }] : []),
    ...(isModAdmin ? [{ to: '/moderators', label: 'Moderators', icon: Users }] : []),
    ...(isModAdmin ? [{ to: '/analytics', label: 'Analytics', icon: BarChart3 }] : []),
    ...(isSuperAdmin ? [{ to: '/settings/ai', label: 'AI Providers', icon: Sparkles }] : []),
    ...(isModAdmin ? [{ to: '/settings/permissions', label: 'Permissions', icon: ShieldAlert }] : []),
    ...(isSuperAdmin ? [{ to: '/audit-log', label: 'Audit Trail', icon: History }] : []),
  ];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <ParkingCircle className="h-5 w-5" />
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-slate-900 block leading-tight">
                Prakaro
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 block">
                Trust & Safety
              </span>
            </div>
          </div>
          <button
            type="button"
            className="md:hidden text-slate-500 hover:text-slate-800"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-slate-200 p-3.5 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-900 truncate">Staff Member</span>
                <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold uppercase text-blue-700">
                  {session.role}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate font-mono">{session.userId}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar for mobile and alerts */}
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
          <button
            type="button"
            className="md:hidden p-1 text-slate-600"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-slate-600">Operations Console Live</span>
          </div>
          <div className="text-xs font-mono text-slate-500">
            Node: Fastify | DB: MySQL | Auth: Better Auth
          </div>
        </header>

        {/* Content View */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
