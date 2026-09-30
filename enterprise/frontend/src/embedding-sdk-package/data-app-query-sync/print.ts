import path from "node:path";

import { QUERY_DEFINITIONS } from "./ast/query-source";
import { discoverActions, discoverQueries } from "./discover";

/**
 * The app's evaluated `defineQuery` and `defineAction` definitions as JSON, or
 * only those in `file`: what the app's `resources/` have to hold.
 */
export async function printDefinitions(appDirectory: string, file?: string) {
  const appRoot = path.resolve(appDirectory);
  const [queries, actions] = await Promise.all([
    discoverQueries(appRoot),
    discoverActions(appRoot),
  ]);
  const inFile = ({ filePath }: { filePath: string }) =>
    file === undefined || filePath === path.resolve(file);

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
    file !== undefined &&
    printed.queries.length === 0 &&
    printed.actions.length === 0
  ) {
    throw new Error(
      `${path.relative(appRoot, path.resolve(file))} has no defineQuery or defineAction definitions.`,
    );
  }

  return JSON.stringify(printed, null, 2);
}
