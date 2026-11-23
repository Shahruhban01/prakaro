import {AttendanceHistory,WorkforceAux} from './pages/Attendance';
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { lazy, Suspense } from 'react';
const Workforce = lazy(() => import('./pages/Workforce').then(m=>({default:m.Workforce})));
const WorkforceDashboard = lazy(() => import('./pages/Workforce').then(m=>({default:m.WorkforceDashboard})));
import { QueueOverview,QueueWorklist,QueueCases,QueueCaseView,ModeratePrerequisites } from './pages/QueueOperations';
import { Queues } from './pages/Queues';
import { QueueSettings } from './pages/QueueSettings';
import { QA } from './pages/QA';
import { Escalations } from './pages/Escalations';
import { Analytics } from './pages/Analytics';
import { AiSettings } from './pages/AiSettings';
import { Permissions } from './pages/Permissions';
import { AuditLog } from './pages/AuditLog';
const PoliciesPage = lazy(() => import('./components/policy/PolicyPages').then(m=>({ default: m.PoliciesPage })));
const OperationsPage = lazy(() => import('./components/operations/OperationsPage').then(m=>({ default: m.OperationsPage })));
import { ClarificationPage } from './components/policy/Clarifications';
import './components/policy/policy.css';

export const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Suspense fallback={<p role="status">Loading dashboard…</p>}><WorkforceDashboard/></Suspense>} />
        {(['organizations','lobs','staff','teams'] as const).flatMap(resource=>['/'+resource,'/'+resource+'/:id'].map(path=><Route key={path} path={path} element={<Suspense fallback={<p role="status">Loading directory…</p>}><Workforce key={path} resource={resource}/></Suspense>}/>))}
        <Route path="/my-attendance" element={<AttendanceHistory/>}/>
        <Route path="/workforce/aux" element={<WorkforceAux/>}/>
        <Route path="/workforce/aux/staff/:id" element={<AttendanceHistory/>}/>
        <Route path="/queues" element={<Queues />} />
        <Route path="/queues/new" element={<QueueSettings />} />
        <Route path="/queues/:id" element={<QueueOverview />} />
        <Route path="/queues/:id/settings" element={<QueueSettings />} />
        <Route path="/queues/:id/cases" element={<QueueCases />} />
        <Route path="/queues/:id/cases/:caseId" element={<QueueCaseView />} />
        <Route path="/cases/:caseId" element={<QueueCaseView />} />
        <Route path="/queues/:id/moderate" element={<ModeratePrerequisites />} />
        <Route path="/my-queues" element={<QueueWorklist subscribed />} />
        <Route path="/available-queues" element={<QueueWorklist subscribed={false} />} />
        <Route path="/my-tasks" element={<Navigate to="/my-queues" replace />} />
        <Route path="/qa/*" element={<QA />} />
        <Route path="/policies/*" element={<Suspense fallback={<p role="status">Loading policies…</p>}><PoliciesPage /></Suspense>} />
        <Route path="/clarifications" element={<ClarificationPage />} />
        <Route path="/clarifications/:id" element={<ClarificationPage />} />
        <Route path="/operations/:view" element={<Suspense fallback={<p role="status">Loading workforce operations…</p>}><OperationsPage /></Suspense>} />
        <Route path="/escalations" element={<Escalations />} />
        <Route path="/moderators" element={<Navigate to="/staff" replace />} />
        <Route path="/analytics/*" element={<Analytics />} />
        <Route path="/settings/ai" element={<AiSettings />} />
        <Route path="/settings/permissions" element={<Permissions />} />
        <Route path="/audit-log" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};
