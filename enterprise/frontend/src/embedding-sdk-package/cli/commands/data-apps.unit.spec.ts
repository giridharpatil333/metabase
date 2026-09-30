import { Command } from "commander";

import {
  makeApp,
  setupResourceTests,
  writeAction,
  writeQuery,
  writeResource,
} from "../../data-app-resources/tests/setup";

import { addDataAppsCommands } from "./data-apps";

const QUESTION = "questionEntityId00010";

async function run(...args: string[]) {
  const program = new Command();
  addDataAppsCommands(program);
  await program.parseAsync(["node", "cli", "data-apps", ...args]);
}

function appWithQuery() {
  const appRoot = makeApp();
  writeQuery(
    appRoot,
    `export const Orders = defineQuery({ savedQuestionEntityId: "${QUESTION}", source: { type: "table", id: 1 } });`,
  );
  return appRoot;
}

describe("data app commands", () => {
  setupResourceTests();

  let stdout: jest.SpyInstance;

  beforeEach(() => {
    stdout = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  const printed = () =>
    stdout.mock.calls.map(([chunk]) => String(chunk)).join("");

  it("prints the definitions of one file, relative to the app root", async () => {
    const appRoot = appWithQuery();
    writeAction(
      appRoot,
      `export const Create = defineAction({ action: { id: 51, parameters: [] } });`,
    );

    await run(
      "print-definitions",
      "queries/orders.query.ts",
      "--app-root",
      appRoot,
    );

    expect(JSON.parse(printed())).toEqual({
      queries: [
        {
          export: "Orders",
          file: "queries/orders.query.ts",
          savedQuestionEntityId: QUESTION,
          query: { source: { type: "table", id: 1 } },
        },
      ],
      actions: [],
    });
  });

  it("confirms resources that back every definition", async () => {
    const appRoot = appWithQuery();
    writeResource(appRoot, "cards/orders.yaml", {
      name: "Orders",
      type: "question",
      entity_id: QUESTION,
    });

    await run("check-resources", "--app-root", appRoot);

    expect(printed()).toBe("resources/ backs every definition.\n");
  });

  it("fails when a definition's resource is missing", async () => {
    const appRoot = appWithQuery();

    await expect(run("check-resources", "--app-root", appRoot)).rejects.toThrow(
      `queries/orders.query.ts:Orders names saved question ${QUESTION}, which no file in resources/cards/ holds.`,
    );
    expect(printed()).toBe("");
  });
});
