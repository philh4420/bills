import { AlertStateRecord, SmartAlert } from "@/types";

export type AlertSuppressionReason = "acknowledged" | "snoozed" | "muted";

export interface SuppressedAlert {
  alert: SmartAlert;
  reason: AlertSuppressionReason;
}

function isSnoozed(state: AlertStateRecord | undefined, now: Date): boolean {
  if (!state?.snoozedUntil) {
    return false;
  }

  const snoozedUntilMs = Date.parse(state.snoozedUntil);
  return Number.isFinite(snoozedUntilMs) && snoozedUntilMs > now.getTime();
}

function isAcknowledged(state: AlertStateRecord | undefined): boolean {
  return Boolean(state?.acknowledgedAt);
}

function isMuted(state: AlertStateRecord | undefined): boolean {
  return state?.muted === true;
}

export function applyAlertStateToAlerts(params: {
  alerts: SmartAlert[];
  states: AlertStateRecord[];
  now?: Date;
}): { activeAlerts: SmartAlert[]; suppressedAlerts: SuppressedAlert[] } {
  const now = params.now || new Date();
  const stateById = new Map(params.states.map((state) => [state.id, state]));
  const activeAlerts: SmartAlert[] = [];
  const suppressedAlerts: SuppressedAlert[] = [];

  params.alerts.forEach((alert) => {
    const state = stateById.get(alert.id);
    if (isMuted(state)) {
      suppressedAlerts.push({ alert, reason: "muted" });
      return;
    }
    if (isSnoozed(state, now)) {
      suppressedAlerts.push({ alert, reason: "snoozed" });
      return;
    }
    if (isAcknowledged(state)) {
      suppressedAlerts.push({ alert, reason: "acknowledged" });
      return;
    }
    activeAlerts.push(alert);
  });

  return { activeAlerts, suppressedAlerts };
}
