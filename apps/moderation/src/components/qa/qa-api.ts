import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, errorText, type Actor } from "../../api";
import type { PinnedPolicy } from "../policy/policyApi";

export type Named = { id: string; name: string };
export type Decision = "APPROVE" | "REJECT" | "ESCALATE";
export type Outcome = "PASS" | "FAIL";
export const categories = ["INCORRECT_DECISION", "MISSING_EVIDENCE", "INCORRECT_POLICY", "INCORRECT_TAGS",
  "UNSUPPORTED_VERIFICATION", "INCOMPLETE_REVIEW", "OTHER"] as const;
export const severities = ["MINOR", "MAJOR", "CRITICAL"] as const;
export const optionalLabel = (value: string | null | undefined) => value ? value.toLowerCase().replaceAll("_", " ")
  .replace(/^./, (first) => first.toUpperCase()) : "Unavailable";
export const percent = (value: number | null) => value === null ? "Unavailable" : String(value) + "%";
export const isAdmin = (actor: Actor) => actor.superAdmin || ["ADMIN", "MODERATION_ADMIN"].includes(actor.role);

export type Overview = {
  generatedAt: string; eligible: number | null; eligibleProcessed: number | null; sampled: number | null; manual: number;
  pending: number; working: number; complete: number; disputes: number; correctionsPending: number; correctionsCompleted: number;
  evaluated: number; passes: number; failures: number; accuracy: number | null; coverage: number | null;
  overturnRate: number | null; correctionRate: number | null; qaHandlingSeconds: number | null;
  errors: { name: string; count: number }[]; severities: { name: string; count: number }[];
};
export type Page<T> = { rows: T[]; page: number; total: number; pageSize: number };
export type ReviewRow = {
  id: string; status: string; completedAt: string; assignedTo: string | null; leaseUntil: string | null;
  queue: Named; organization: Named; lob: Named; moderator: Named; assignee: Named | null;
  decision: { version: number; action: Decision; case: { id: string; code: string } };
  assessment: { originalOutcome: Outcome; finalOutcome: Outcome | null; finalScore: number | null } | null;
  policy: { id: string; version: number; rate: number } | null;
};
type Evidence = { id: string; source: string; finding: string; reference: string; expiresAt: string; cited?: boolean };
export type ReviewDetail = Omit<ReviewRow, "decision" | "assessment"> & {
  assignmentVersion: number; startedAt: string | null;
  currentPolicyId?: string | null;
  decision: ReviewRow["decision"] & {
    createdAt: string; reason: string; policyVersion: number; evidenceIds: string[]; answers: Record<string, unknown>;
    pinnedPolicy?: PinnedPolicy | null; policyTags?: string[] | null;
    case: ReviewRow["decision"]["case"] & { facilityId: string; status: string };
    qaSnapshot: { facilityId: string; form: { key: string; label: string }[]; evidence: Evidence[];
      reviewPolicy: string | null; publication: string | null; truncated: boolean } | null;
  };
  assessment: NonNullable<ReviewRow["assessment"]> & {
    originalScore: number; category: string | null; severity: string | null; notes: string | null;
    policyReference: string | null; proposedAction: Decision | null; handlingSeconds: number;
  } | null;
  dispute: { id: string; reason: string; status: string; resolution: string | null } | null;
  correction: { id: string; action: Decision; reason: string; reviewerId: string | null; leaseUntil: string | null;
    approvedAt: string | null; handlingSeconds: number | null; publicationLabelId: string | null } | null;
  capabilities: { assess: boolean; adjudicate: boolean; dispute: boolean; assign: boolean; recommend: boolean };
  eligibleAuditors: Named[];
  currentEvidence: Evidence[];
  history: { id: string; action: string; actorType: string; actorName: string | null; createdAt: string; after: Record<string, unknown> }[];
};
export type Directory = Record<"organizations" | "lobs" | "queues" | "moderators" | "auditors" | "teams", Named[]> & { policyVersions?: Named[] };
export type PolicyData = {
  organizations: Named[]; queues: (Named & { organizationId: string })[]; lobs: (Named & { organizationId: string })[];
  policies: { id: string; organizationId: string; queueId: string | null; lobId: string | null;
    organization: Named; lob: Named | null; queue: Named | null; rate: number; enabled: boolean;
    effectiveFrom: string; effectiveTo: string | null; version: number; passScore: number; failScore: number }[];
};

export function useQa<T>(actor: Actor, path: string, params: Record<string, string> = {}, poll = 15000) {
  return useQuery({
    queryKey: ["quality-assurance", actor.userId, actor.organizationId, actor.role, path, params],
    queryFn: async ({ signal }) => (await api.get<T>(path, { signal, params, timeout: 27000 })).data,
    refetchInterval: poll || false, refetchIntervalInBackground: false, retry: false,
  });
}

export function useQaAction() {
  const query = useQueryClient();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function perform<T>(url: string, body: object = {}, notice: string | ((data: T) => string) = "Changes saved.", committed?: (data: T) => void) {
    if (busy.current) return;
    busy.current = true;
    setPending(true); setError(""); setMessage("");
    try {
      const result = await api.post<T>(url, body);
      await query.invalidateQueries({ queryKey: ["quality-assurance"] });
      setMessage(typeof notice === "function" ? notice(result.data) : notice);
      committed?.(result.data);
    } catch (cause) { setError(errorText(cause)); }
    finally { busy.current = false; setPending(false); }
  }
  return { pending, error, message, perform };
}
