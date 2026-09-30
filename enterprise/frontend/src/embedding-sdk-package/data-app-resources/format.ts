import path from "node:path";

import { QUERY_DEFINITIONS } from "./ast/definition-source";
import { discoverActions, discoverQueries } from "./discover";

/**
 * The app's evaluated `defineQuery` and `defineAction` definitions as JSON, or
 * only those in `file` (relative to the app root, as files are printed): what
 * the app's `resources/` have to hold.
 */
export async function formatDefinitions(appDirectory: string, file?: string) {
  const appRoot = path.resolve(appDirectory);
  const [queries, actions] = await Promise.all([
    discoverQueries(appRoot),
    discoverActions(appRoot),
  ]);
  const filePath = file === undefined ? undefined : path.resolve(appRoot, file);
  const inFile = (definition: { filePath: string }) =>
    filePath === undefined || definition.filePath === filePath;

  const printed = {
    queries: queries.filter(inFile).map((query) => {
      const authored = { ...query.query };
      delete authored[QUERY_DEFINITIONS.idKey];

      return {
        export: query.exportName,
        file: path.relative(appRoot, query.filePath),
        savedQuestionEntityId: query.savedQuestionEntityId ?? null,
        query: authored,
      };
    }),
    actions: actions.filter(inFile).map((action) => ({
      export: action.exportName,
      file: path.relative(appRoot, action.filePath),
      copiedActionEntityId: action.copiedActionEntityId ?? null,
      action: action.action,
    })),
  };

  if (
    filePath !== undefined &&
    printed.queries.length === 0 &&
    printed.actions.length === 0
  ) {
    throw new Error(
      `${path.relative(appRoot, filePath)} has no defineQuery or defineAction definitions.`,
    );
  }

  return JSON.stringify(printed, null, 2);
}
