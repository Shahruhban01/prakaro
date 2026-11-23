import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ParkingCircle, Lock, Mail, AlertCircle, ArrowRight, ShieldAlert, Users } from 'lucide-react';
import { api } from '../api';
import { useQueryClient } from '@tanstack/react-query';

export const Login: React.FC = () => {
  const [authDomain, setAuthDomain] = useState<'moderator' | 'super_admin'>('moderator');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const endpoint =
      authDomain === 'super_admin'
        ? '/api/super-admin-auth/sign-in/email'
        : '/api/moderator-auth/sign-in/email';

    try {
      sessionStorage.removeItem('prakaro_auth_token');
      delete api.defaults.headers.common.Authorization;
      queryClient.clear();
      const signedOut=await Promise.allSettled(['moderator-auth', 'super-admin-auth'].map(domain =>
        axios.post('/api/'+domain+'/sign-out', {}, {timeout:5000,headers:{'X-Prakaro-Console':'1'}})));
      const locked=signedOut.find(item=>item.status==='rejected'&&item.reason?.response?.data?.error?.code==='ACTIVE_CASE');
      if(locked?.status==='rejected')throw locked.reason;
      await axios.post(
        endpoint,
        { email, password },
        {
          headers: { 'Content-Type': 'application/json', 'X-Prakaro-Console': '1' },
          withCredentials: true,
        },
      );

      sessionStorage.removeItem('prakaro_auth_token');
      delete api.defaults.headers.common.Authorization;
      queryClient.clear();

      navigate('/dashboard');
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error?.message ||
          'Invalid credentials for this administrative domain.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-8">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm mb-3">
            <ParkingCircle className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Prakaro Moderation</h1>
          <p className="text-xs text-slate-500 mt-1">
            Enterprise Parking Verification & Trust Platform
          </p>
        </div>

        {/* Identity Domain Segment Toggle */}
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-xs">
          <button
            type="button"
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 font-semibold transition-all ${
              authDomain === 'moderator'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setAuthDomain('moderator')}
          >
            <Users className="h-3.5 w-3.5" /> Staff / Moderator
          </button>
          <button
            type="button"
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 font-semibold transition-all ${
              authDomain === 'super_admin'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setAuthDomain('super_admin')}
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Super Admin
          </button>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-2.5 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {authDomain === 'super_admin' ? 'Super Admin Email' : 'Staff / Moderator Email'}
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="email"
                required
                className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
                placeholder={
                  authDomain === 'super_admin' ? 'superadmin@prakaro.app' : 'moderator@prakaro.app'
                }
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="password"
                required
                className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-2.5 text-xs font-semibold mt-2"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Signing in...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                Sign in to Console <ArrowRight className="h-3.5 w-3.5" />
              </span>
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-100 pt-4 text-center">
          <p className="text-[11px] text-slate-400">
            {authDomain === 'super_admin'
              ? 'Super Admin Domain: Restrictive identity boundary. All logins audited.'
              : 'Moderator Domain: Operational review and QA. Ordinary users are isolated.'}
          </p>
        </div>
      </div>
    </div>
  );
};
