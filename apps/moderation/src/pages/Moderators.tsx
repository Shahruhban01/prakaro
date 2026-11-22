import React, { useState } from 'react';
import { Users, UserPlus, Shield, Check, X, AlertCircle } from 'lucide-react';
import type { StaffMember, Queue } from '../api';
import { useData, useAction, errorText } from '../api';
import { StatusBadge } from '../components/StatusBadge';

const STAFF_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MODERATION_MANAGER',
  'SUPERVISOR',
  'QA_REVIEWER',
  'MODERATOR',
  'VIEWER',
] as const;

export const Moderators: React.FC = () => {
  const { data: staff, isLoading, refetch } = useData<StaffMember[]>('/moderators');
  const { data: queues } = useData<Queue[]>('/queues');
  const action = useAction();

  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffMember['role']>('MODERATOR');
  const [active, setActive] = useState(true);
  const [selectedQueues, setSelectedQueues] = useState<string[]>([]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    action.mutate(
      {
        url: '/moderators',
        method: 'post',
        data: {
          email,
          role,
          active,
          queues: selectedQueues,
        },
      },
      {
        onSuccess: () => {
          setShowModal(false);
          setEmail('');
          setSelectedQueues([]);
          refetch();
        },
      },
    );
  };

  const openEdit = (member: StaffMember) => {
    setEmail(member.user.email);
    setRole(member.role);
    setActive(member.active);
    setSelectedQueues(member.memberships.map((m) => m.queueId));
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Moderation Staff & Access</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage reviewer roles, queue assignments, and team operational permissions.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary text-xs"
          onClick={() => {
            setEmail('');
            setRole('MODERATOR');
            setActive(true);
            setSelectedQueues([]);
            setShowModal(true);
          }}
        >
          <UserPlus className="w-4 h-4" /> Add / Configure Staff
        </button>
      </div>

      {action.error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorText(action.error)}</span>
        </div>
      )}

      {/* Staff Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="card w-full max-w-lg p-6 space-y-4 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-sm font-bold text-slate-900">Staff Member Configuration</h2>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  User Email (Existing Better Auth Account)
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@prakaro.app"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Assigned Role</label>
                <select
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                  value={role}
                  onChange={(e: any) => setRole(e.target.value)}
                >
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  <span className="font-semibold text-slate-700">Account Active for Moderation</span>
                </label>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Assigned Queues ({selectedQueues.length} selected)
                </label>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded p-2 space-y-1.5 bg-slate-50">
                  {queues?.map((q) => {
                    const isAssigned = selectedQueues.includes(q.id);
                    return (
                      <label key={q.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-blue-600"
                          checked={isAssigned}
                          onChange={() => {
                            setSelectedQueues(
                              isAssigned
                                ? selectedQueues.filter((id) => id !== q.id)
                                : [...selectedQueues, q.id],
                            );
                          }}
                        />
                        <span className="font-semibold text-slate-800">{q.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({q.code})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={action.isPending}
                  className="btn-primary text-xs"
                >
                  {action.isPending ? 'Saving...' : 'Save Staff Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Name / Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Assigned Queues</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Loading staff directory...
                  </td>
                </tr>
              ) : staff && staff.length > 0 ? (
                staff.map((m) => (
                  <tr key={m.userId} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{m.user?.name || 'Staff Member'}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{m.user?.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 font-mono">
                        {m.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {m.active ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <Check className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600">
                          <X className="w-3.5 h-3.5" /> Deactivated
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                      {m.memberships.length} queue(s)
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        className="btn-secondary text-[11px] py-1 px-2.5"
                        onClick={() => openEdit(m)}
                      >
                        Edit Access
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No moderation staff found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
