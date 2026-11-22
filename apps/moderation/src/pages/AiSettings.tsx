import React, { useState } from 'react';
import { Sparkles, CheckCircle2, AlertCircle, RefreshCw, Cpu, ShieldAlert } from 'lucide-react';
import type { AiStatusData } from '../api';
import { useData, useAction, errorText } from '../api';

export const AiSettings: React.FC = () => {
  const { data: aiStatus, isLoading, refetch } = useData<AiStatusData>('/ai/providers');
  const action = useAction();
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; text?: string } | null>(
    null,
  );

  const runSmokeTest = () => {
    setTestResult(null);
    action.mutate(
      { url: '/ai/test', method: 'post' },
      {
        onSuccess: (res: any) => {
          setTestResult(res);
          refetch();
        },
      },
    );
  };

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading AI provider configuration...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">AI Provider Configuration</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Advisory AI triage providers, model discovery status, and synthetic generation diagnostics.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Primary Provider Card */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Primary Provider: Google Gemini
              </h2>
            </div>
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">
              PRIORITY #1
            </span>
          </div>

          <div className="text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Configured Model:</span>
              <span className="font-mono font-bold text-slate-900">{aiStatus?.geminiModel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">API Gateway:</span>
              <span className="font-mono text-slate-600">Google AI Studio REST (v1beta)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Output Validation:</span>
              <span className="text-emerald-700 font-medium">Strict JSON Schema (Zod)</span>
            </div>
          </div>
        </div>

        {/* Fallback Provider Card */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Fallback: OpenRouter Free
              </h2>
            </div>
            <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-mono">
              FALLBACK
            </span>
          </div>

          <div className="text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Configured Model:</span>
              <span className="font-mono font-bold text-slate-900">{aiStatus?.openRouterModel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Fallback Policy:</span>
              <span className="font-semibold text-slate-800">
                {aiStatus?.fallbackEnabled ? 'Enabled on outage/quota' : 'Disabled'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Paid Models Allowed:</span>
              <span className="text-emerald-700 font-semibold font-mono">
                {aiStatus?.allowPaidModels ? 'YES' : 'NO (Free Models Only)'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Usage and Quota Card */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
          Daily AI Attempt Budget & Quota Protection
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-slate-500 block text-[11px]">Calls Made Today</span>
            <span className="text-xl font-bold text-slate-900 font-mono">
              {aiStatus?.callsToday ?? 0}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-slate-500 block text-[11px]">Daily Hard Cap</span>
            <span className="text-xl font-bold text-slate-900 font-mono">
              {aiStatus?.dailyLimit ?? 50} calls/day
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-slate-500 block text-[11px]">Remaining Calls</span>
            <span className="text-xl font-bold text-blue-600 font-mono">
              {Math.max(0, (aiStatus?.dailyLimit ?? 50) - (aiStatus?.callsToday ?? 0))}
            </span>
          </div>
        </div>
      </div>

      {/* Live Synthetic Smoke Test Panel */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Synthetic Smoke Test Diagnostic</h2>
            <p className="text-[11px] text-slate-500">
              Dispatches a synthetic classification request to verify live generation and JSON structured outputs.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary text-xs"
            onClick={runSmokeTest}
            disabled={action.isPending}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${action.isPending ? 'animate-spin' : ''}`} />
            {action.isPending ? 'Testing Model...' : 'Run Live Smoke Test'}
          </button>
        </div>

        {testResult && (
          <div
            className={`p-4 rounded-lg border text-xs space-y-2 ${
              testResult.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600" />
              )}
              <span>{testResult.message}</span>
            </div>
            {testResult.text && (
              <pre className="p-2.5 bg-white/80 rounded border border-emerald-200 font-mono text-[11px] overflow-x-auto">
                {testResult.text}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
