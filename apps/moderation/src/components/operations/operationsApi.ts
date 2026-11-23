import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, errorText } from "../../api";

export type Named = { id: string; name: string };
export type Options = {
  organizations: Named[]; lobs: Named[]; teams: Named[]; employees: (Named & { status: string })[];
  queues: Named[]; shifts: (Named & { organizationId: string })[]; timezone: string; canManage: boolean; canAdmin: boolean;
};
export const names = (value: string | null | undefined) => value ? value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()) : "Unavailable";
export const dateTime = (value: string | null | undefined, timezone: string) => value ? new Date(value).toLocaleString(undefined, { timeZone: timezone }) : "Unavailable";
export const clock = (value: string, timezone: string) => new Date(value).toLocaleTimeString(undefined, { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
export const number = (value: number | null | undefined, digits = 1) => value == null ? "Unavailable" : value.toLocaleString(undefined, { maximumFractionDigits: digits });
export const percentage = (value: number | null | undefined) => value == null ? "Unavailable" : number(value * 100) + "%";
export const seconds = (value: number | null | undefined) => value == null ? "Unavailable" : number(value) + "s";
export const hours = (value: number | null | undefined) => value == null ? "Unavailable" : number(value / 3600) + " h";
export const dayMs = 86400000;
export function localKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year","month","day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}
export function todayIn(timezone: string, offset = 0) {
  return addDays(localKey(new Date(), timezone), offset);
}
export const addDays = (date: string, offset: number) => new Date(Date.parse(date) + offset * dayMs).toISOString().slice(0, 10);
export const showError = errorText;

const keys = ["organizationId","teamId","lobId","employeeId","managerId","queueId","shiftId","from","through","timezone","attendance","aux","page"];
export function useOpsFilters() {
  const [search, setSearch] = useSearchParams();
  const params = Object.fromEntries(keys.flatMap((key) => search.get(key) ? [[key, search.get(key)!]] : []));
  function update(values: Record<string, string>) {
    const next = new URLSearchParams(search);
    if (!Object.hasOwn(values, "page")) next.delete("page");
    if (Object.hasOwn(values, "organizationId")) for (const name of ["teamId","lobId","employeeId","managerId","queueId","shiftId"]) next.delete(name);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    setSearch(next);
  }
  return { search, params, update };
}
export function useOps<T>(actorId: string, path: string, params: Record<string, unknown> = {}, enabled = true, interval = 0) {
  return useQuery({
    queryKey: ["workforce-operations", actorId, path, params], enabled, retry: false,
    queryFn: async () => (await api.get<T>(path, { baseURL: "/api/v1", params })).data,
    refetchInterval: interval || false,
  });
}
export function useOpsAction() {
  const client = useQueryClient();
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function run<T>(url: string, data: unknown, method = "post", message = "Saved.") {
    if (active.current) return undefined;
    active.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api.request<T>({ url, baseURL: "/api/v1", data, method });
      await client.invalidateQueries({ queryKey: ["workforce-operations"] });
      setNotice(message);
      return result.data;
    } catch (cause) { setError(errorText(cause)); }
    finally { active.current = false; setBusy(false); }
  }
  async function download(report: string, params: Record<string, unknown>) {
    setError(""); setBusy(true);
    try {
      const result = await api.get<Blob>("/reports/export", { params: { ...params, report }, responseType: "blob" });
      const link = document.createElement("a");
      const address = URL.createObjectURL(result.data);
      link.href = address; link.download = "prakaro-" + report + ".csv";
      link.click(); window.setTimeout(() => URL.revokeObjectURL(address), 1000);
      setNotice("Report downloaded.");
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return { run, download, busy, error, notice };
}
