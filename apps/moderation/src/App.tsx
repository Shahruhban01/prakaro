import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Queues } from './pages/Queues';
import { QueueDetail } from './pages/QueueDetail';
import { QueueSettings } from './pages/QueueSettings';
import { Cases } from './pages/Cases';
import { CaseWorkbench } from './pages/CaseWorkbench';
import { MyTasks } from './pages/MyTasks';
import { QA } from './pages/QA';
import { Escalations } from './pages/Escalations';
import { Moderators } from './pages/Moderators';
import { Analytics } from './pages/Analytics';
import { AiSettings } from './pages/AiSettings';
import { Permissions } from './pages/Permissions';
import { AuditLog } from './pages/AuditLog';

export const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/queues" element={<Queues />} />
        <Route path="/queues/new" element={<QueueSettings />} />
        <Route path="/queues/:id" element={<QueueDetail />} />
        <Route path="/queues/:id/settings" element={<QueueSettings />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/cases/:id" element={<CaseWorkbench />} />
        <Route path="/my-tasks" element={<MyTasks />} />
        <Route path="/qa" element={<QA />} />
        <Route path="/escalations" element={<Escalations />} />
        <Route path="/moderators" element={<Moderators />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings/ai" element={<AiSettings />} />
        <Route path="/settings/permissions" element={<Permissions />} />
        <Route path="/audit-log" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};
