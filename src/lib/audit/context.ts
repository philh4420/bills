import { MonthKey } from "@/types";

export interface WriteUndoRegistration {
  kind: string;
  payload: Record<string, unknown>;
}

export interface WriteAuditMutation {
  entityType?: string;
  entityId?: string;
  month?: MonthKey;
  before?: unknown;
  after?: unknown;
  message?: string;
}

export interface WriteCommandContext {
  id: string;
  setUndo: (registration: WriteUndoRegistration) => void;
  setMutation: (mutation: WriteAuditMutation) => void;
}
