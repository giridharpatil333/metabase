import { isObject } from "metabase-types/guards";

import { checkResources } from "../data-app-resources/check";

import { readManifest } from "./config/read-manifest";

import { dataAppConfig } from "./index";

jest.mock("vite", () => ({ loadEnv: jest.fn(() => ({})) }));
jest.mock("@vitejs/plugin-react", () => ({
  __esModule: true,
  default: () => ({ name: "mock-react" }),
}));
jest.mock("./config/build-config", () => ({
  dataAppBuildPlugins: () => [],
  dataAppLibBuild: () => ({}),
}));
jest.mock("./config/find-env-root", () => ({
  findEnvRoot: (appRoot: string) => appRoot,
}));
jest.mock("./dev-plugin/plugin", () => ({
  dataAppSandboxDevPlugin: () => ({ name: "mock-sandbox-dev" }),
}));
jest.mock("./config/read-manifest");
jest.mock("../data-app-resources/check", () => ({
  checkResources: jest.fn(),
}));

const mockedReadManifest = jest.mocked(readManifest);

afterEach(() => jest.resetAllMocks());

describe("dataAppConfig", () => {
  it("throws when the cwd has no data_app.yaml (run from the wrong directory)", () => {
    mockedReadManifest.mockReturnValue(null);

    expect(() => dataAppConfig()).toThrow(/No data_app\.yaml found/);
  });

  it("builds the config when a manifest is present", () => {
    mockedReadManifest.mockReturnValue({
      manifestPath: "/app/data_app.yaml",
      manifest: { allowed_hosts: [] },
    });

    const config = dataAppConfig();

    expect(config.server?.port).toBe(5174);
    expect(config.plugins).toBeDefined();
  });

  it("uses the port override", () => {
    mockedReadManifest.mockReturnValue({
      manifestPath: "/app/data_app.yaml",
      manifest: {},
    });

    expect(dataAppConfig({ port: 4000 }).server?.port).toBe(4000);
  });

  describe("the resource check", () => {
    type ResourceCheckPlugin = {
      apply: unknown;
      buildStart: () => Promise<void>;
    };

    const isResourceCheckPlugin = (
      candidate: unknown,
    ): candidate is ResourceCheckPlugin =>
      isObject(candidate) &&
      candidate.name === "metabase-resource-check" &&
      typeof candidate.buildStart === "function";

    // Vite accepts nested plugin arrays, and `dataAppConfig` returns one.
    const flatten = (option: unknown): unknown[] =>
      Array.isArray(option) ? option.flatMap(flatten) : [option];

    const resourceCheckPlugin = () => {
      mockedReadManifest.mockReturnValue({
        manifestPath: "/app/data_app.yaml",
        manifest: {},
      });

      const plugin = flatten(dataAppConfig().plugins).find(
        isResourceCheckPlugin,
      );

      if (!plugin) {
        throw new Error("The resource check plugin is missing.");
      }

      return plugin;
    };

    it("runs only for a production build", () => {
      expect(resourceCheckPlugin().apply).toBe("build");
    });

    it("checks the app's resources when the build starts", async () => {
      await resourceCheckPlugin().buildStart();

      expect(checkResources).toHaveBeenCalledWith(process.cwd());
    });

    it("fails the build when the check fails", async () => {
      jest
        .mocked(checkResources)
        .mockRejectedValue(new Error("resources don't back the definitions"));

      await expect(resourceCheckPlugin().buildStart()).rejects.toThrow(
        "resources don't back the definitions",
      );
    });
  });
});
