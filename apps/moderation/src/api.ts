import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const api = axios.create({
  baseURL: '/api/v1/moderation',
  headers: { 'X-Prakaro-Console': '1' },
  withCredentials: true,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('prakaro_auth_token') : null;
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export type Actor = {
  userId: string;
  role:
    | 'SUPER_ADMIN'
    | 'ADMIN'
    | 'MODERATION_ADMIN'
    | 'MODERATION_MANAGER'
    | 'SUPERVISOR'
    | 'QA_REVIEWER'
    | 'MODERATOR'
    | 'VIEWER';
  admin: boolean;
  superAdmin?: boolean;
  queues: string[];
  email?: string;
  name?: string;
};

export type Rule =
  | { op: 'AND' | 'OR'; children: Rule[] }
  | { field: string; value: string };

export type Question = {
  key: string;
  label: string;
  type: 'SELECT' | 'MULTI' | 'BOOLEAN' | 'TEXT' | 'NUMBER' | 'DATE' | 'EVIDENCE' | 'REASON' | 'NOTES';
  required: boolean;
  options: string[];
  when?: { key: string; equals: string };
};

export type Config = {
  rule: Rule;
  form: Question[];
  columns: string[];
  slaHours: number;
  qaPercent: number;
};

export type Queue = {
  id: string;
  code: string;
  name: string;
  description: string;
  kind: 'GENERAL' | 'AI' | 'ACCESS' | 'REPORT' | 'REVERIFY' | 'ESCALATION' | 'QA';
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  capacity: number;
  priority: number;
  version: number;
  config: Config;
  taskCount?: number;
};

export type CaseRow = {
  id: string;
  code: string;
  facilityId: string;
  category: string;
  status:
    | 'NEW'
    | 'QUEUED'
    | 'ASSIGNED'
    | 'IN_REVIEW'
    | 'AWAITING_EVIDENCE'
    | 'ESCALATED'
    | 'PENDING_QA'
    | 'APPROVED'
    | 'REJECTED'
    | 'CLOSED'
    | 'REOPENED';
  trigger: string;
  priority: number;
  owner: string | null;
  leaseUntil?: string | null;
  createdAt: string;
  revision: number;
  tasks?: { id: string; queueId: string; deadline: string }[];
};

export type EvidenceItem = {
  id: string;
  source: 'PRAKARO_AUDIT' | 'PARKING_OPERATOR' | 'PUBLIC_AUTHORITY';
  finding: string;
  reference: string;
  approvedAt?: string | null;
  expiresAt: string;
};

export type FacilityDetails = {
  displayName: string;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string;
  googleMapsUrl: string;
  placeMetadata?: Record<string, any> | null;
  userReport?: {
    category: string;
    notes?: string | null;
    reportedAt?: string;
    reporterId?: string;
  } | null;
};

export type Detail = Omit<CaseRow, 'tasks'> & {
  admission: {
    demand: number;
    facility?: {
      googlePlaceId?: string;
      displayName?: string;
      formattedAddress?: string;
      latitude?: number | null;
      longitude?: number | null;
      placeMetadata?: any;
      evidence?: EvidenceItem[];
      runs?: {
        id: string;
        status: string;
        outcome: string | null;
        createdAt: string;
      }[];
      labels?: {
        id: string;
        decision: string;
        reviewedAt: string;
        reviewerId: string | null;
        notes: string | null;
      }[];
    };
  };
  facilityDetails?: FacilityDetails;
  userReport?: FacilityDetails['userReport'];
  metadata?: any;
  tasks: {
    id: string;
    queueId: string;
    queueVersion: number;
    deadline?: string;
    form: Config;
    queue?: { id: string; name: string; code: string; kind: string };
  }[];
  reviews: {
    id: string;
    action: string;
    reason: string;
    reviewerId: string;
    answers: Record<string, unknown>;
    evidenceIds: string[];
    createdAt: string;
  }[];
};

export type StaffMember = {
  userId: string;
  role: Actor['role'];
  active: boolean;
  user: { id: string; name: string; email: string; createdAt: string };
  memberships: { queueId: string }[];
};

export type Analytics = {
  totalCases: number;
  verifiedCount: number;
  byStatus: { status: string; count: number }[];
  byCategory: { category: string; count: number }[];
};

export type AuditLogEntry = {
  id: string;
  actor: string;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
  createdAt: string;
};

export type AiStatusData = {
  priority: string;
  geminiModel: string;
  openRouterModel: string;
  fallbackEnabled: boolean;
  allowPaidModels: boolean;
  callsToday: number;
  dailyLimit: number;
};

export function useData<T>(url: string, enabled: boolean = true) {
  return useQuery({
    queryKey: [url],
    queryFn: async () => (await api.get<T>(url)).data,
    enabled,
    retry: false,
    staleTime: 5000,
  });
}

export function useAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { url: string; data?: unknown; method?: 'put' | 'post' | 'delete' }) =>
      (
        await api.request({
          url: input.url,
          method: input.method ?? 'post',
          data: input.data ?? {},
        })
      ).data,
    onSuccess: () => client.invalidateQueries(),
  });
}

export function errorText(error: unknown) {
  return axios.isAxiosError(error)
    ? String(error.response?.data?.error?.message ?? error.message)
    : 'Request failed.';
}
