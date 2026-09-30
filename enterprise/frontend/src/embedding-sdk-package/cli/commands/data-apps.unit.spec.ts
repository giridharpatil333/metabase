import { Command } from "commander";

import { checkResources } from "../../data-app-query-sync/check";
import { printDefinitions } from "../../data-app-query-sync/print";

import { addDataAppsCommands } from "./data-apps";

jest.mock("../../data-app-query-sync/check", () => ({
  checkResources: jest.fn(),
}));

jest.mock("../../data-app-query-sync/print", () => ({
  printDefinitions: jest.fn().mockResolvedValue('{"queries":[],"actions":[]}'),
}));

async function run(...args: string[]) {
  const program = new Command();
  addDataAppsCommands(program);
  await program.parseAsync(["node", "cli", "data-apps", ...args]);
}

describe("data app commands", () => {
  beforeEach(() => {
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("checks the resources of the requested app root", async () => {
    await run("check-resources", "--app-root", "data_apps/orders");

    expect(checkResources).toHaveBeenCalledWith("data_apps/orders");
    expect(process.stdout.write).toHaveBeenCalledWith(
      "resources/ backs every definition.\n",
    );
  });

  it("checks the resources of the current directory by default", async () => {
    await run("check-resources");

    expect(checkResources).toHaveBeenCalledWith(process.cwd());
  });

  it("prints the definitions of one file", async () => {
    await run(
      "print-definitions",
      "queries/orders.query.ts",
      "--app-root",
      "data_apps/orders",
    );

    expect(printDefinitions).toHaveBeenCalledWith(
      "data_apps/orders",
      "queries/orders.query.ts",
    );
    expect(process.stdout.write).toHaveBeenCalledWith(
      '{"queries":[],"actions":[]}\n',
    );
  });

  it("prints every definition by default", async () => {
    await run("print-definitions");

    expect(printDefinitions).toHaveBeenCalledWith(process.cwd(), undefined);
  });
});
