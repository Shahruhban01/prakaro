import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { workspaceIssue, type Decision, type Issue, type Snapshot, type SubmissionResult } from "./workspaceContract";

type Reading = Snapshot & { offset: number };
type Operation = "start" | "next" | "submit" | "submit-leave" | "leave" | "restore";
type Attempt = { reservationId: string; decision: Decision; andLeave: boolean };

function read(snapshot: Snapshot, sentAt: number): Reading {
  return { ...snapshot, offset: Date.parse(snapshot.serverTime) - (sentAt + Date.now()) / 2 };
}

export function useModerateWorkspace(queueId: string, actorId?: string) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const key = ["moderation-workspace", actorId, queueId] as const;
  const [operation, setOperation] = useState<Operation | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [reconnecting, setReconnecting] = useState(false);
  const [retryDecision, setRetryDecision] = useState<Attempt | null>(null);
  const busy = useRef(false);
  const pending = useRef<Attempt | null>(null);

  function refreshAux() {
    return client.invalidateQueries({ queryKey: ["attendance-current"] });
  }

  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const sent = Date.now();
      const result = await api.get<Snapshot>(`/queues/${queueId}/moderate/current`, { signal, timeout: 10000 });
      const reading = read(result.data, sent);
      if (result.data.session) await refreshAux();
      return reading;
    },
    retry: false,
    networkMode: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    gcTime: 0,
  });
  const reading = query.data;
  const session = reading?.session;
  const reservation = reading?.reservation;
  const reservationId = reservation?.id;
  const problem = issue ?? (query.error ? workspaceIssue(query.error) : null);
  const serverNow = now + (reading?.offset ?? 0);
  const leaseTime = reservation ? Date.parse(reservation.leaseExpiresAt) : 0;
  const remaining = Math.max(0, Math.ceil((leaseTime - serverNow) / 1000));
  const expired = problem?.kind === "lease" || Boolean(reading?.leaseExpired) ||
    Boolean(reservation && (!Number.isFinite(leaseTime) || remaining === 0));
  const terminal = ["lease", "access", "session", "queue"].includes(problem?.kind ?? "");

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const connection = () => { setOnline(navigator.onLine); tick(); };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, []);

  useEffect(() => {
    if (!reservationId || terminal) return;
    let disposed = false;
    let controller: AbortController | undefined;
    async function heartbeat() {
      if (disposed || controller || busy.current || !navigator.onLine) return;
      controller = new AbortController();
      const sent = Date.now();
      try {
        const { data } = await api.post<{ leaseExpiresAt: string; serverTime: string }>(
          `/reservations/${reservationId}/heartbeat`, {}, { signal: controller.signal, timeout: 8000 },
        );
        if (disposed || busy.current) return;
        client.setQueryData<Reading>(["moderation-workspace", actorId, queueId], (previous) =>
          previous && previous.reservation && previous.reservation.id === reservationId
            ? read({ ...previous, serverTime: data.serverTime,
              reservation: { ...previous.reservation, leaseExpiresAt: data.leaseExpiresAt } }, sent)
            : previous,
        );
        setNow(Date.now());
        setIssue((previous) => previous?.kind === "connection" ? null : previous);
      } catch (error) {
        if (!disposed && !busy.current) {
          const next = workspaceIssue(error);
          if (!pending.current || next.kind !== "lease") setIssue(next);
        }
      } finally {
        controller = undefined;
        if (!disposed) setReconnecting(false);
      }
    }
    const wake = () => {
      if (!document.hidden && navigator.onLine && !busy.current) {
        setReconnecting(true);
        void heartbeat();
      }
    };
    const timer = window.setInterval(heartbeat, 30000);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      disposed = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [actorId, client, queueId, reservationId, terminal]);

  function save(reading: Reading) {
    client.setQueryData(key, reading);
    setNow(Date.now());
  }

  async function run(name: Operation, task: () => Promise<void>) {
    if (busy.current || !navigator.onLine) return;
    busy.current = true;
    setOperation(name);
    setIssue(null);
    try {
      await client.cancelQueries({ queryKey: key, exact: true });
      await task();
    } catch (error) {
      const problem = workspaceIssue(error);
      if (pending.current && problem.kind === "connection") setRetryDecision(pending.current);
      else if (name === "submit" || name === "submit-leave") clearAttempt();
      setIssue(problem);
    } finally {
      busy.current = false;
      setOperation(null);
    }
  }

  function clearAttempt() {
    pending.current = null;
    setRetryDecision(null);
  }

  async function start() {
    await run("start", async () => {
      const sent = Date.now();
      const { data } = await api.post<Snapshot>(`/queues/${queueId}/moderate/start`, {}, { timeout: 10000 });
      const reading = read(data, sent);
      await refreshAux();
      save(reading);
    });
  }

  async function restore() {
    await run("restore", async () => {
      const result = await query.refetch({ throwOnError: true });
      if (result.data?.reservation?.id !== pending.current?.reservationId) clearAttempt();
      setNow(Date.now());
      await refreshAux();
    });
  }

  async function submit(decision: Decision, andLeave: boolean) {
    if (!reservationId || !session || expired || terminal || busy.current || !navigator.onLine) return;
    const attempt = pending.current ?? { reservationId, decision, andLeave };
    if (attempt.reservationId !== reservationId || attempt.andLeave !== andLeave) return;
    pending.current = attempt;
    await run(andLeave ? "submit-leave" : "submit", async () => {
      const sent = Date.now();
      const endpoint = andLeave ? "submit-and-leave" : "submit";
      const { data } = await api.post<SubmissionResult>(
        `/reservations/${attempt.reservationId}/${endpoint}`, attempt.decision, { timeout: 12000 },
      );
      clearAttempt();
      setNotice("Decision saved.");
      void client.invalidateQueries({ queryKey: ["queue-live"] });
      void client.invalidateQueries({ queryKey: ["operations-analytics"] });
      save(read({
        session: data.sessionEnded ? null : { ...session, casesCompleted: data.casesCompleted },
        reservation: data.nextReservation,
        serverTime: data.serverTime,
      }, sent));
      if (data.sessionEnded) {
        await refreshAux();
        navigate("/my-queues", { state: { moderationCompleted: data.casesCompleted } });
      } else if (!data.nextReservation) await refreshAux();
    });
  }

  async function leave() {
    if (!session) return;
    await run("leave", async () => {
      await api.post(`/sessions/${session.id}/leave`, { reason: "USER_RELEASE" }, { timeout: 10000 });
      client.setQueryData<Reading>(key, (previous) => previous && {
        ...previous, session: null, reservation: null, leaseExpired: false,
      });
      await refreshAux();
      void client.invalidateQueries({ queryKey: ["queue-live"] });
      navigate("/my-queues");
    });
  }

  async function next() {
    if (!session) return;
    await run("next", async () => {
      const sent = Date.now();
      const { data } = await api.post<Pick<Snapshot, "reservation" | "serverTime">>(
        `/sessions/${session.id}/next`, {}, { timeout: 10000 },
      );
      const reading = read({ ...data, session }, sent);
      setNotice("");
      clearAttempt();
      await refreshAux();
      save(reading);
    });
  }

  return {
    session, reservation, remaining, serverNow, expired, operation, problem, online,
    reconnecting: reconnecting && !terminal, notice, retryDecision,
    connecting: query.isPending && !reading && !problem,
    start, restore, submit, leave, next,
  };
}
