import { Activity, Check, ChevronDown, LockKeyhole } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { useId } from "react";
export const auxLabels = {
  MODERATING: "Moderating",
  NON_MODERATING: "Non-moderating",
  BREAK: "Break",
  MEETING: "Meeting",
  OFFLINE: "Offline",
  TRAINING: "Training",
} as const;
export type AuxStatus = keyof typeof auxLabels;
export type AuxState =
  | { available: false; message?: string }
  | {
      available: true;
      status: AuxStatus;
      elapsedSeconds: number;
      pending?: boolean;
      locked?: boolean;
      disabled?: boolean;
      error?: string;
      lastSync?: number;
    };
export function formatAht(seconds: number | null) {
  return seconds !== null && Number.isFinite(seconds) && seconds >= 0
    ? `${Number(seconds.toFixed(1))}s`
    : "Unavailable";
}
export function formatAuxTime(seconds: number) {
  const elapsed = Math.floor(Math.max(0, seconds));
  return [
    Math.floor(elapsed / 3600),
    Math.floor(elapsed / 60) % 60,
    elapsed % 60,
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
export function GlobalAuxControl({
  state = { available: false },
  onPunch,
}: {
  state?: AuxState;
  onPunch?: (status: AuxStatus) => void;
}) {
  const lockHelp = useId();
  const explanation = !state.available
    ? (state.message ?? "Attendance service unavailable.")
    : state.locked
      ? "Submit or safely release your active case before changing AUX."
      : state.pending
        ? "Updating AUX…"
        : state.error;
  const clock = state.available ? formatAuxTime(state.elapsedSeconds) : null;
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        className="aux-trigger"
        aria-label="AUX status"
        aria-describedby={state.available && state.locked ? lockHelp : undefined}
        title={clock ?? undefined}
      >
        {state.available && state.locked ? (
          <LockKeyhole size={15} />
        ) : (
          <Activity size={15} />
        )}
        <span>
          <strong>AUX</strong>{" "}
          {state.available
            ? auxLabels[state.status]
            : state.message === "Loading attendance…"
              ? "Loading"
              : "Unavailable"}
        </span>
        {clock && <time className="aux-inline-timer">{clock}</time>}
        <ChevronDown size={14} />
      </Popover.Trigger>
      {state.available && state.locked && <span className="sr-only" id={lockHelp}>AUX is locked while a case is reserved.</span>}
      <Popover.Portal>
        <Popover.Content className="aux-popover" align="end" sideOffset={8}>
          {clock && (
            <p>
              Elapsed time <strong>{clock}</strong>
            </p>
          )}
          {state.available && state.lastSync && (
            <p>
              Last synchronized {new Date(state.lastSync).toLocaleTimeString()}
            </p>
          )}
          {explanation && (
            <p role={state.available && state.error ? "alert" : "status"}>
              {explanation}
            </p>
          )}
          {Object.entries(auxLabels).map(([key, label]) => (
            <button
              type="button"
              key={key}
              disabled={
                !state.available ||
                state.disabled ||
                state.locked ||
                state.pending ||
                state.status === key ||
                !onPunch
              }
              onClick={() => onPunch?.(key as AuxStatus)}
            >
              {label}
              {state.available && state.status === key && <Check size={14} />}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
