import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { api, errorText, type Actor } from "./api";
import type { AuxStatus, AuxState } from "./components/GlobalAuxControl";

export const attendanceHttp = { baseURL: "/api/v1/workforce" };
export type AuxSnapshot = {
  state: AuxStatus | null;
  startedAt: string | null;
  serverTime: string;
  attendanceSessionId: string | null;
  version: number | null;
  canTransition: boolean;
  lockReason: "ACTIVE_CASE" | null;
  presence: "ONLINE" | "DISCONNECTED" | "SIGNED_OUT";
  presenceStaleSeconds?: number;
};
type Reading = { snapshot: AuxSnapshot; receivedAt: number; offsetMs: number };
async function read(
  response: Promise<{ data: AuxSnapshot }>,
): Promise<Reading> {
  const start = Date.now(),
    { data } = await response,
    receivedAt = Date.now();
  return {
    snapshot: data,
    receivedAt,
    offsetMs: Date.parse(data.serverTime) - (start + receivedAt) / 2,
  };
}
export function useAttendanceControl(actor?: Actor) {
  const client = useQueryClient();
  const key = ["attendance-current", actor?.userId] as const;
  const enabled = Boolean(actor && !actor.superAdmin);
  const [now, setNow] = useState(Date.now);
  const current = useQuery({
    queryKey: key,
    enabled,
    queryFn: ({ signal }) =>
      read(api.get("/aux/me", { ...attendanceHttp, signal })),
    retry: false,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
  const heartbeat = useMutation({
    mutationFn: () =>
      read(api.post("/attendance/heartbeat", {}, attendanceHttp)),
    onSuccess: async (reading) => {
      client.setQueryData<Reading>(key, (previous) =>
        !previous ||
        Date.parse(reading.snapshot.serverTime) >=
          Date.parse(previous.snapshot.serverTime)
          ? reading
          : previous,
      );
    },
  });
  const sendHeartbeat = heartbeat.mutate;
  useEffect(() => {
    if (!enabled) return;
    function pulse() {
      if (document.visibilityState === "visible") sendHeartbeat();
    }
    pulse();
    const timer = window.setInterval(pulse, 30000);
    document.addEventListener("visibilitychange", pulse);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", pulse);
    };
  }, [enabled, sendHeartbeat, actor?.userId]);
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled]);
  const transition = useMutation({
    mutationFn: (state: AuxStatus) => {
      const snap = current.data?.snapshot;
      return read(
        api.post(
          "/aux/transition",
          {
            state,
            attendanceSessionId: snap?.attendanceSessionId,
            version: snap?.version,
          },
          attendanceHttp,
        ),
      );
    },
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: (reading) => {
      client.setQueryData(key, reading);
      if (actor?.userId) {
        client.setQueryData(["moderate-aux", actor.userId], reading.snapshot);
      }
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: key });
      client.invalidateQueries({ queryKey: ["moderate-aux"] });
    },
  });
  const reading = current.data,
    snap = reading?.snapshot;
  const error =
    transition.error ??
    current.error ??
    (!snap?.state ? heartbeat.error : null);
  const expired = axios.isAxiosError(error) && error.response?.status === 401;
  const caseError =
    axios.isAxiosError(transition.error) &&
    transition.error.response?.data?.error?.code === "ACTIVE_CASE";
  const disconnected =
    Boolean(
      current.error && !axios.isAxiosError(current.error)
        ? true
        : axios.isAxiosError(current.error) && !current.error.response,
    ) ||
    Boolean(
      reading &&
      now - reading.receivedAt > (snap?.presenceStaleSeconds ?? 90) * 1000,
    ) ||
    Boolean(snap?.presence === "DISCONNECTED");
  let state: AuxState = { available: false };
  if (enabled && !snap?.state)
    state = {
      available: false,
      message: expired
        ? "Session expired"
        : error
          ? errorText(error)
          : "Loading attendance…",
    };
  if (enabled && snap?.state && snap.startedAt && reading)
    state = {
      available: true,
      status: snap.state,
      elapsedSeconds: Math.max(
        0,
        (now + reading.offsetMs - Date.parse(snap.startedAt)) / 1000,
      ),
      pending: transition.isPending,
      locked: snap.lockReason === "ACTIVE_CASE" || caseError,
      disabled:
        !snap.canTransition ||
        disconnected ||
        expired ||
        Boolean(current.error),
      lastSync: reading.receivedAt,
      error: expired
        ? "Session expired. Sign in again."
        : disconnected
          ? "Connection interrupted. Reconnecting…"
          : error
            ? errorText(error)
            : undefined,
    };
  return { state, punch: transition.mutate, expired, snapshot: snap };
}
