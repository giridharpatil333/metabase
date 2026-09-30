import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import {
  type PortableTable,
  addUserToGroup,
  dataAppIframe,
  dataAppPermissionGroupId,
  mockDataApp,
  newEntityId,
  publishDataApp,
  resourceCard,
  resourceCollection,
  resourceImplicitAction,
  writeDataAppResources,
} from "e2e/support/helpers";

const { H } = cy;

const TEST_TABLE = "scoreboard_actions";
const MODEL_NAME = "Scoreboard model";

const APP_SLUG = "synced-actions-app";
const APP_DISPLAY_NAME = "Synced Actions App";

/** The fixture's `data_app.yaml` names this collection. */
const COLLECTION = "syncedActionsAppColl1";

const SCOREBOARD_TABLE: PortableTable = [
  "Writable Postgres12",
  "public",
  TEST_TABLE,
];

const APP_ROOT = () =>
  `${Cypress.config("projectRoot")}/e2e/support/assets/data-apps/${APP_SLUG}`;

/**
 * The action half of the production path. Outside the dev preview
 * `toExecutableActionId` runs `copiedActionEntityId`, the copy on the app's copy
 * of the model, because that is the only action an app's viewers may execute.
 * The copies reach Metabase through `resources/` and a repository pull.
 */
describe(
  "scenarios > data apps > resources in production (actions)",
  { tags: ["@external", "@actions"] },
  () => {
    const removeTestFiles = () =>
      cy.task("removeDataAppPaths", {
        paths: [`${APP_ROOT()}/actions`, `${APP_ROOT()}/resources`],
      });

    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      H.resetTestTable({ type: "postgres", table: TEST_TABLE });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEST_TABLE });
      H.setActionsEnabledForDB(WRITABLE_DB_ID);
      H.createModelFromTableName({
        tableName: TEST_TABLE,
        modelName: MODEL_NAME,
      });

      removeTestFiles();
    });

    after(() => {
      removeTestFiles();
    });

    /**
     * Declares the source model's create action, writes the copies an author
     * copies from the repository, publishes the app, and yields the copy's
     * entity ID.
     */
    const publishApp = () =>
      cy.get<number>("@modelId").then((modelId) =>
        H.createImplicitAction({ model_id: modelId, kind: "create" }).then(
          ({ body: source }) => {
            const modelCopy = newEntityId();
            const actionCopy = newEntityId();

            cy.task("writeDataAppFiles", {
              files: {
                [`${APP_ROOT()}/actions/orders.action.ts`]: [
                  'import { defineAction } from "@metabase/embedding-sdk-react/data-app";',
                  "",
                  "export const CreateScore = defineAction({",
                  `  copiedActionEntityId: "${actionCopy}",`,
                  `  action: { id: ${source.id}, entityId: "${source.entity_id}", parameters: [] },`,
                  "});",
                  "",
                ].join("\n"),
              },
            });
            writeDataAppResources(APP_ROOT(), {
              collection: resourceCollection(
                COLLECTION,
                "Data App: Synced Actions App",
              ),
              cards: [
                resourceCard({
                  entityId: modelCopy,
                  name: MODEL_NAME,
                  type: "model",
                  collection: COLLECTION,
                  table: SCOREBOARD_TABLE,
                }),
              ],
              actions: [
                resourceImplicitAction({
                  entityId: actionCopy,
                  name: "Create",
                  kind: "row/create",
                  model: modelCopy,
                }),
              ],
            });

            return publishDataApp(APP_ROOT(), APP_SLUG).then(() =>
              cy.wrap(actionCopy, { log: false }),
            );
          },
        ),
      );

    it("executes the app's copy rather than the authored action", () => {
      publishApp().then((actionCopy) => {
        cy.intercept("POST", "/api/action/*/execute").as("execute");
        mockDataApp(APP_SLUG, { displayName: APP_DISPLAY_NAME });
        cy.visit(`/apps/${APP_SLUG}`);

        dataAppIframe(APP_DISPLAY_NAME).within(() => {
          cy.findByTestId("action-execute", { timeout: 30000 }).click();
          cy.findByTestId("action-output").should("have.text", "executed");
        });

        cy.wait("@execute")
          .its("request.url")
          .should("contain", `/api/action/${actionCopy}/execute`);
      });
    });

    it("lets a member of the app's group execute it", () => {
      publishApp().then((actionCopy) => {
        dataAppPermissionGroupId(APP_SLUG).then((groupId) => {
          addUserToGroup(groupId, USERS.normal.email);

          cy.signInAsNormalUser();
          cy.intercept("POST", "/api/action/*/execute").as("execute");
          mockDataApp(APP_SLUG, { displayName: APP_DISPLAY_NAME });
          cy.visit(`/apps/${APP_SLUG}`);

          dataAppIframe(APP_DISPLAY_NAME).within(() => {
            cy.findByTestId("action-execute", { timeout: 30000 }).click();
            cy.findByTestId("action-output").should("have.text", "executed");
          });

          cy.wait("@execute")
            .its("request.url")
            .should("contain", `/api/action/${actionCopy}/execute`);
        });
      });
    });
  },
);
