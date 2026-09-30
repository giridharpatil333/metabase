import path from "node:path";

import { printDefinitions } from "../print";

import {
  makeApp,
  setupResourceSyncTests,
  writeAction,
  writeQuery,
} from "./setup";

const QUESTION = "questionEntityId00010";

function appWithDefinitions() {
  const appRoot = makeApp();
  writeQuery(
    appRoot,
    `export const Orders = defineQuery({ savedQuestionEntityId: "${QUESTION}", source: { type: "table", id: 1 }, limit: 5 });`,
  );
  writeAction(
    appRoot,
    `export const Create = defineAction({ action: { id: 51, entityId: "sourceActionEntity051", parameters: [] } });`,
  );
  return appRoot;
}

describe("printing definitions", () => {
  setupResourceSyncTests();

  it("prints every evaluated definition with its ID", async () => {
    const appRoot = appWithDefinitions();

    expect(JSON.parse(await printDefinitions(appRoot))).toEqual({
      queries: [
        {
          export: "Orders",
          file: "queries/orders.query.ts",
          savedQuestionEntityId: QUESTION,
          query: { source: { type: "table", id: 1 }, limit: 5 },
        },
      ],
      actions: [
        {
          export: "Create",
          file: "actions/orders.action.ts",
          copiedActionEntityId: null,
          action: {
            id: 51,
            entityId: "sourceActionEntity051",
            parameters: [],
          },
        },
      ],
    });
  });

  it("prints only the definitions in the given file", async () => {
    const appRoot = appWithDefinitions();

    expect(
      JSON.parse(
        await printDefinitions(
          appRoot,
          path.join(appRoot, "actions/orders.action.ts"),
        ),
      ),
    ).toEqual({
      queries: [],
      actions: [expect.objectContaining({ export: "Create" })],
    });
  });

  it("resolves a relative file against the app root, as it prints files", async () => {
    const appRoot = appWithDefinitions();

    expect(
      JSON.parse(await printDefinitions(appRoot, "actions/orders.action.ts")),
    ).toEqual({
      queries: [],
      actions: [expect.objectContaining({ export: "Create" })],
    });
  });

  it("fails for a file without definitions", async () => {
    const appRoot = appWithDefinitions();

    await expect(
      printDefinitions(appRoot, path.join(appRoot, "src/App.tsx")),
    ).rejects.toThrow(
      "src/App.tsx has no defineQuery or defineAction definitions.",
    );
  });
});
