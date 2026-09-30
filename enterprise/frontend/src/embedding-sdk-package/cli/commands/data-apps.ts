import type { Command } from "commander";

import { checkResources } from "../../data-app-resources/check";
import { printDefinitions } from "../../data-app-resources/print";

export function addDataAppsCommands(program: Command) {
  const dataAppsCommand = program
    .command("data-apps")
    .description("manage Metabase data apps");

  dataAppsCommand
    .command("print-definitions")
    .description(
      "print the data app's evaluated query and action definitions as JSON",
    )
    .argument(
      "[file]",
      "only the definitions in this file, relative to the app directory",
    )
    .option("--app-root <path>", "data app directory", process.cwd())
    .action(
      async (file: string | undefined, { appRoot }: { appRoot: string }) => {
        process.stdout.write(`${await printDefinitions(appRoot, file)}\n`);
      },
    );

  dataAppsCommand
    .command("check-resources")
    .description(
      "check that the data app's resources/ directory backs its query and action definitions",
    )
    .option("--app-root <path>", "data app directory", process.cwd())
    .action(async ({ appRoot }: { appRoot: string }) => {
      await checkResources(appRoot);
      process.stdout.write("resources/ backs every definition.\n");
    });
}
