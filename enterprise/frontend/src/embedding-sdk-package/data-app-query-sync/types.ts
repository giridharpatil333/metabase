export interface DiscoveredQuery {
  exportName: string;
  filePath: string;
  query: Record<string, unknown>;
  savedQuestionEntityId?: string;
}

export interface DiscoveredAction {
  exportName: string;
  filePath: string;
  action: Record<string, unknown>;
  copiedActionEntityId?: string;
  sourceActionId: number;
}

export type ResourceModel = "Card" | "Action";
