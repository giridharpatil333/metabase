import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  type PortableTable,
  addUserToGroup,
  buildDataAppHostApp,
  dataAppHostAppRoot,
  dataAppPermissionGroupId,
  declareDataAppQueries,
  newEntityId,
  publishDataApp,
  resetDataAppHostAppSources,
  resourceCard,
  resourceCollection,
  runDataAppCli,
  writeDataAppResources,
} from "e2e/support/helpers";
import type { Card, CollectionItem, DataApp } from "metabase-types/api";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

/** The app is published under its directory's name. */
const APP_SLUG = "vite-6-data-app-host-app";

const APP_ROOT = () => dataAppHostAppRoot();
const MANIFEST_FILE = () => `${APP_ROOT()}/data_app.yaml`;

const COLLECTION = "hostAppCollection0001";

const AUTHORED_MANIFEST = `name: Vite 6 Data App
version: 1
path: ./dist/index.js
allowed_hosts:
  - https://allowed.data-app.test
`;

const ORDERS_TABLE: PortableTable = ["Sample Database", "PUBLIC", "ORDERS"];

const collection = () =>
  resourceCollection(COLLECTION, "Data App: Vite 6 Data App");

/** The saved question an author writes for a plain `Orders` definition. */
const ordersQuestion = (entityId: string, stage = {}) =>
  resourceCard({
    entityId,
    name: "Orders",
    type: "question",
    collection: COLLECTION,
    table: ORDERS_TABLE,
    stage,
  });

const countOf = (metric: string) => ({
  aggregation: [["metric", { "lib/uuid": crypto.randomUUID() }, metric]],
});

/**
 * Runs the app's resources end to end against the dev host app, a real vite
 * data app with the published SDK installed: the CLI an author runs, the build
 * guard, and the repository pull that loads what the author wrote.
 */
describe("Embedding SDK: data-app resources (queries)", () => {
  const resetHostApp = () => {
    resetDataAppHostAppSources();
    cy.writeFile(MANIFEST_FILE(), AUTHORED_MANIFEST);
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    // The query and actions specs share a checked-in host app, so start clean.
    resetHostApp();
    cy.writeFile(
      MANIFEST_FILE(),
      `${AUTHORED_MANIFEST}collection: ${COLLECTION}\n`,
    );
  });

  after(() => {
    resetHostApp();
  });

  describe("the CLI", () => {
    it("prints the definitions an author writes the resources from", () => {
      const question = newEntityId();
      declareDataAppQueries(APP_ROOT(), [
        { name: "Orders", tableId: ORDERS_ID, savedQuestionEntityId: question },
      ]);

      runDataAppCli("print-definitions").then(({ exitCode, stdout }) => {
        expect(exitCode, stdout).to.eq(0);
        expect(JSON.parse(stdout)).to.deep.eq({
          queries: [
            {
              export: "Orders",
              file: "queries/orders.query.ts",
              savedQuestionEntityId: question,
              query: { source: { type: "table", id: ORDERS_ID } },
            },
          ],
          actions: [],
        });
      });
    });

    it("checks that the resources back every definition, listing every problem", () => {
      const question = newEntityId();
      const stale = newEntityId();
      declareDataAppQueries(APP_ROOT(), [
        { name: "Orders", tableId: ORDERS_ID, savedQuestionEntityId: question },
      ]);

      writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [ordersQuestion(question)],
      });
      runDataAppCli("check-resources").then(({ exitCode, stdout }) => {
        expect(exitCode).to.eq(0);
        expect(stdout).to.contain("resources/ backs every definition.");
      });

      writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [ordersQuestion(stale)],
      });
      runDataAppCli("check-resources").then(({ exitCode, stderr }) => {
        expect(exitCode).not.to.eq(0);
        expect(stderr).to.contain(
          `queries/orders.query.ts:Orders names saved question ${question}, which no file in resources/cards/ holds.`,
        );
        expect(stderr).to.contain(
          "is a question no definition names. Delete it.",
        );
      });
    });
  });

  it("publishes the saved question with a pull, readable by the app's group alone", () => {
    const question = newEntityId();
    declareDataAppQueries(APP_ROOT(), [
      { name: "Orders", tableId: ORDERS_ID, savedQuestionEntityId: question },
    ]);
    writeDataAppResources(APP_ROOT(), {
      collection: collection(),
      cards: [ordersQuestion(question)],
    });
    publishDataApp(APP_ROOT(), APP_SLUG);

    cy.request<DataApp>(`/api/apps/${APP_SLUG}`).then(({ body: app }) => {
      expect(app.table_ids).to.deep.eq([ORDERS_ID]);

      cy.request<Card>(`/api/card/${question}`).then(({ body: card }) => {
        expect(card.collection_id).to.eq(app.resource_collection_id);
        expect(card.name).to.eq("Orders");

        dataAppPermissionGroupId(APP_SLUG).then((groupId) => {
          addUserToGroup(groupId, USERS.normal.email);
        });

        cy.signInAsNormalUser();
        cy.request(`/api/card/${question}`)
          .its("body.id")
          .should("eq", card.id);

        cy.signIn("nocollection");
        cy.request({ url: `/api/card/${question}`, failOnStatusCode: false })
          .its("status")
          .should("eq", 403);
      });
    });
  });

  it("publishes a copy of the metric a query uses, readable by the app's group alone", () => {
    H.createQuestion({
      name: "Orders count",
      type: "metric",
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
    }).then(({ body: metric }) => {
      const question = newEntityId();
      const metricCopy = newEntityId();

      declareDataAppQueries(APP_ROOT(), [
        {
          name: "OrdersCount",
          tableId: ORDERS_ID,
          metricId: metric.id,
          savedQuestionEntityId: question,
        },
      ]);
      writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [
          ordersQuestion(question, countOf(metricCopy)),
          resourceCard({
            entityId: metricCopy,
            name: "Orders count",
            type: "metric",
            collection: COLLECTION,
            table: ORDERS_TABLE,
            stage: {
              aggregation: [["count", { "lib/uuid": crypto.randomUUID() }]],
            },
          }),
        ],
      });
      publishDataApp(APP_ROOT(), APP_SLUG);

      cy.request<DataApp>(`/api/apps/${APP_SLUG}`).then(({ body: app }) => {
        cy.request<{ data: CollectionItem[] }>(
          `/api/collection/${app.resource_collection_id}/items?models=metric`,
        ).then(({ body: { data: metrics } }) => {
          expect(metrics.map(({ name }) => name)).to.deep.eq(["Orders count"]);
          const [copy] = metrics;
          expect(copy.id, "a copy, not the source metric").not.to.eq(metric.id);

          dataAppPermissionGroupId(APP_SLUG).then((groupId) => {
            addUserToGroup(groupId, USERS.normal.email);
          });

          cy.signInAsNormalUser();
          cy.request(`/api/card/${copy.id}`).its("status").should("eq", 200);
          cy.request<Card>(`/api/card/${question}`).then(({ body: card }) => {
            cy.request("POST", `/api/card/${card.id}/query`)
              .its("body.data.rows.0.0")
              .should("be.greaterThan", 0);
          });

          cy.signIn("nocollection");
          cy.request({ url: `/api/card/${copy.id}`, failOnStatusCode: false })
            .its("status")
            .should("eq", 403);
        });
      });
    });
  });

  it("refuses resources that read a card outside the app, and loads none of them", () => {
    H.createQuestion({
      name: "Orders count",
      type: "metric",
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
    }).then(({ body: metric }) => {
      const question = newEntityId();

      declareDataAppQueries(APP_ROOT(), [
        {
          name: "OrdersCount",
          tableId: ORDERS_ID,
          metricId: metric.id,
          savedQuestionEntityId: question,
        },
      ]);
      // The question reads the source metric instead of a copy in the app.
      writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [ordersQuestion(question, countOf(metric.entity_id))],
      });

      publishDataApp(APP_ROOT(), APP_SLUG, { expectSynced: false }).then(
        (app) => {
          expect(app.sync_error).to.contain(
            `references Card ${metric.entity_id}, which is not one of the app's resources`,
          );
          cy.request({ url: `/api/card/${question}`, failOnStatusCode: false })
            .its("status")
            .should("eq", 404);
        },
      );
    });
  });

  describe("the build guard", () => {
    /** `cy.exec` reports the command's output; vite prints this only on success. */
    const expectBuildToSucceed = () =>
      buildDataAppHostApp().should((result) => {
        expect(`${result.stdout}${result.stderr}`).to.contain("built in");
      });

    // `metabase-resource-check` runs on buildStart and never calls Metabase, so
    // an app whose definitions name missing resources is refused before it can
    // be bundled.
    it("refuses to build when a definition's saved question is missing", () => {
      const question = newEntityId();
      declareDataAppQueries(APP_ROOT(), [
        { name: "Orders", tableId: ORDERS_ID, savedQuestionEntityId: question },
      ]);
      writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [ordersQuestion(question)],
      });
      expectBuildToSucceed();

      writeDataAppResources(APP_ROOT(), { collection: collection() });
      buildDataAppHostApp().should((result) => {
        const output = `${result.stdout}${result.stderr}`;
        expect(output, "the build is refused").to.contain(
          `names saved question ${question}, which no file in resources/cards/ holds.`,
        );
        expect(output).not.to.contain("built in");
      });

      writeDataAppResources(APP_ROOT(), {
        collection: collection(),
        cards: [ordersQuestion(question)],
      });
      expectBuildToSucceed();
    });
  });
});
