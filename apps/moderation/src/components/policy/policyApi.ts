import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText, type Actor } from "../../api";

export { actions, policyDocument, policyAnswers, fieldVisible, reporterExplanation, validatePolicyDecision,
  evidenceKind } from "../../../../api/src/modules/moderation/policy/contracts";
export type { PolicyDocument, PinnedPolicy, PolicyField, PolicyAction } from "../../../../api/src/modules/moderation/policy/contracts";

export type Named = { id: string; name: string };
export type VersionHeader = { id: string; number: number; status: string; revision: number;
  changeSummary: string; publishedAt: string | null; archivedAt: string | null; contentHash: string | null };
export const handlesPolicy = (actor?: Actor) =>
  Boolean(actor?.superAdmin || actor?.role === "ADMIN" || actor?.role === "MODERATION_ADMIN");

export const readable = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
export function usePolicyQuery<T>(key: string, path: string, params: Record<string, unknown> = {}, enabled = true, interval = 0) {
  return useQuery({
    queryKey: ["versioned-policy", key, path, params],
    queryFn: async () => (await api.get<T>(path, { params })).data,
    enabled, retry: false, refetchInterval: interval || false,
  });
}
export function usePolicyAction() {
  const client = useQueryClient();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function run<T>(path: string, data: unknown, method: "post" | "patch" | "put" = "post", notification = "") {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = (await api.request<T>({ method, url: path, data })).data;
      await client.invalidateQueries({ queryKey: ["versioned-policy"] });
      setMessage(notification);
      return result;
    } catch (cause) { setError(errorText(cause)); }
    finally { running.current = false; setBusy(false); }
  }
  return { busy, error, message, run };
}
