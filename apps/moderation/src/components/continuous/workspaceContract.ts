import axios from "axios";
import { z } from "zod";
import type { Question } from "../../api";
import { policyDocument, type PinnedPolicy } from "../policy/policyApi";

export type Evidence = {
  id: string;
  source: string;
  finding: string;
  reference: string;
  approvedAt: string | null;
  expiresAt: string;
};

export type Attachment = { id: string; contentType: string; path: string; description: string };

export type Reservation = {
  id: string;
  queueId: string;
  reservedAt: string;
  leaseExpiresAt: string;
  pinnedPolicy?: PinnedPolicy | null;
  case: {
    code: string;
    status: string;
    category: string;
    trigger: string;
    priority: number;
    createdAt: string;
    admission?: {
      facility?: {
        id: string;
        displayName: string | null;
        formattedAddress?: string | null;
        evidence: Evidence[];
        labels?: { reviewedAt: string; decision: string; expiresAt: string | null }[];
      };
    };
    tasks?: { queueId: string; queueVersion: number; form: unknown }[];
    metadata?: { report?: { category?: unknown; notes?: unknown } };
    attachments?: Attachment[];
  };
};

export type Session = { id: string; casesCompleted: number };
export type Snapshot = {
  session: Session | null;
  reservation: Reservation | null;
  serverTime: string;
  leaseExpired?: boolean;
};
export type SubmissionResult = {
  casesCompleted: number;
  sessionEnded: boolean;
  nextReservation: Reservation | null;
  serverTime: string;
};

export const actionSchema = z.enum(["APPROVE", "REJECT", "ESCALATE"]);
const submissionSchema = z.object({
  action: actionSchema,
  reason: z.string().trim().min(3).max(500),
  evidenceIds: z.array(z.string()).max(12),
  answers: z.record(z.string(), z.unknown()),
  tagIds: z.array(z.string()).max(32).optional(),
  policyVersionId: z.string().uuid().optional(),
});
export type Decision = z.infer<typeof submissionSchema>;

const question = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: z.string(),
  type: z.enum(["SELECT", "MULTI", "BOOLEAN", "TEXT", "NUMBER", "DATE", "EVIDENCE", "REASON", "NOTES"]),
  required: z.boolean(),
  options: z.array(z.string()).default([]),
  when: z.object({ key: z.string(), equals: z.string() }).optional(),
});
const savedForm = z.union([
  z.object({ form: z.array(question), reviewPolicy: z.string().optional() }),
  z.array(question).transform((form) => ({ form, reviewPolicy: undefined })),
  z.object({}).strict().transform(() => ({ form: [], reviewPolicy: undefined })),
]);

export function policyFor(reservation: Reservation) {
  if (reservation.pinnedPolicy) {
    const parsed = policyDocument.safeParse(reservation.pinnedPolicy.document);
    return parsed.success ? { version: reservation.pinnedPolicy.number, form: [], reviewPolicy: undefined,
      pinned: { ...reservation.pinnedPolicy, document: parsed.data } } : null;
  }
  const task = reservation.case.tasks?.find(({ queueId }) => queueId === reservation.queueId);
  const parsed = savedForm.safeParse(task?.form);
  return parsed.success ? { ...parsed.data, version: task?.queueVersion, pinned: undefined } : null;
}

export const label = (value: string) =>
  value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());

export function activeQuestions(questions: Question[], rawAnswers: Record<string, unknown>) {
  const answers: Record<string, unknown> = {};
  const visible = questions.filter((item) => {
    if (item.when && answers[item.when.key] !== item.when.equals) return false;
    const value = rawAnswers[item.key];
    if (value !== undefined && value !== "" && !(Array.isArray(value) && !value.length)) {
      answers[item.key] = value;
    }
    return true;
  });
  return { visible, answers };
}

function answerValid(item: Question, value: unknown, evidenceIds: string[]) {
  if (value === undefined) return !item.required;
  switch (item.type) {
    case "NUMBER": return typeof value === "number" && Number.isFinite(value);
    case "DATE": return z.string().date().safeParse(value).success;
    case "MULTI": return Array.isArray(value) && value.every((choice) => item.options.includes(choice));
    case "EVIDENCE": return typeof value === "string" && evidenceIds.includes(value);
    case "BOOLEAN": return ["YES", "NO", "UNKNOWN"].includes(String(value));
    case "SELECT": return typeof value === "string" && item.options.includes(value);
    case "REASON":
      if (item.options.length) return typeof value === "string" && item.options.includes(value);
      return z.string().max(1000).safeParse(value).success;
    default: return z.string().max(1000).safeParse(value).success;
  }
}

export function validateDecision(
  value: { action?: string; reason?: string; evidenceIds?: string[]; answers?: Record<string, unknown> },
  questions: Question[],
  eligibleEvidence: Evidence[],
) {
  const { visible, answers } = activeQuestions(questions, value.answers ?? {});
  const evidenceIds = value.evidenceIds ?? [];
  const errors = new Map<string, string>();
  const parsed = submissionSchema.safeParse({ ...value, evidenceIds, answers });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0]);
      errors.set(field, field === "action" ? "Choose a decision." : field === "reason"
        ? "Enter a reason between 3 and 500 characters."
        : "Review your evidence and answers.");
    }
  }
  if (evidenceIds.some((id) => !eligibleEvidence.some((evidence) => evidence.id === id)))
    errors.set("evidenceIds", "Remove evidence that is no longer current.");
  if (value.action === "APPROVE" && !evidenceIds.length)
    errors.set("evidenceIds", "Select current independent evidence to approve parking.");
  for (const field of visible) {
    if (!answerValid(field, answers[field.key], evidenceIds))
      errors.set(field.key, field.required && answers[field.key] === undefined
        ? "Required." : "Choose or enter a permitted value.");
  }
  return { visible, errors, decision: !errors.size && parsed.success ? parsed.data : null };
}

export type Issue = {
  kind: "connection" | "lease" | "session" | "access" | "queue" | "submission";
  message: string;
};

export function workspaceIssue(error: unknown): Issue {
  if (!axios.isAxiosError(error)) return { kind: "submission", message: "The request failed. Try again." };
  const status = error.response?.status;
  const code = error.response?.data?.error?.code;
  if (!status || status >= 500) return {
    kind: "connection",
    message: "The server could not confirm the request. Your current draft is still here.",
  };
  if (status === 401 || ["INVALID_SESSION", "MODERATING_AUX_REQUIRED"].includes(code))
    return { kind: "session", message: "The moderation session needs to be restored. Check your sign-in and AUX state." };
  if (status === 403) return { kind: "access", message: "Your moderation access is no longer available for this queue." };
  if (["RESERVATION_EXPIRED", "LEASE_EXPIRED", "INVALID_RESERVATION"].includes(code))
    return { kind: "lease", message: "The case lease expired or was released. This draft cannot be submitted." };
  if (status === 404 || code === "QUEUE_UNAVAILABLE") return { kind: "queue", message: "The queue or session is unavailable." };
  return { kind: "submission", message: String(error.response?.data?.error?.message ?? "The request failed. Try again.") };
}
