import { User } from "../../../src/models";
import { isMobile } from "../../support/utils";

const apiGraphQL = `${Cypress.env("apiUrl")}/graphql`;

type BankAccountsTestCtx = {
  user?: User;
};

describe("Bank Accounts", function () {
  const ctx: BankAccountsTestCtx = {};

  beforeEach(function () {
    // The first thing we are doing is seeding our database using a custom Cypress task.
    cy.task("db:seed");

    // Next, we use cy.intercept() to intercept every GET request to the /notifications route.
    // We are then aliasing this intercept to "getNotifications". When you see @getNotifications
    // used within a test, it is referring to this intercept.
    cy.intercept("GET", "/notifications").as("getNotifications");

    // Next, we have another cy.intercept() to intercept every POST request to our GraphQL endpoint.
    // We then have three conditionals to determine the GraphQL query and then set the appropriate
    // alias accordingly.
    cy.intercept("POST", apiGraphQL, (req) => {
      const { body } = req;

      if (body.hasOwnProperty("operationName") && body.operationName === "ListBankAccount") {
        req.alias = "gqlListBankAccountQuery";
      }

      if (body.hasOwnProperty("operationName") && body.operationName === "CreateBankAccount") {
        req.alias = "gqlCreateBankAccountMutation";
      }

      if (body.hasOwnProperty("operationName") && body.operationName === "DeleteBankAccount") {
        req.alias = "gqlDeleteBankAccountMutation";
      }
    });

    // Finally, we use a custom Cypress command cy.database() to query our database for our users.
    // Then we use another custom Cypress command cy.loginByXState() to log in to the application
    // using one of the users returned from the cy.database().
    cy.database("find", "users").then((user: User) => {
      ctx.user = user;

      return cy.loginByXstate(ctx.user.username);
    });

    // You can find out how these custom Commands work in greater detail here:
    // https://learn.cypress.io/real-world-examples/custom-cypress-commands
  });

  it("creates a new bank account", function () {
    cy.wait("@getNotifications");
    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }

    cy.getBySel("sidenav-bankaccounts").click();

    cy.getBySel("bankaccount-new").click();
    cy.location("pathname").should("eq", "/bankaccounts/new");
    cy.visualSnapshot("Display New Bank Account Form");

    cy.getBySelLike("bankName-input").type("The Best Bank");
    cy.getBySelLike("routingNumber-input").type("987654321");
    cy.getBySelLike("accountNumber-input").type("123456789");
    cy.visualSnapshot("Fill out New Bank Account Form");
    cy.getBySelLike("submit").click();

    cy.wait("@gqlCreateBankAccountMutation");

    cy.getBySelLike("bankaccount-list-item")
      .should("have.length", 2)
      .eq(1)
      .should("contain", "The Best Bank");
    cy.visualSnapshot("Bank Account Created");
  });

  it("should display bank account form errors", function () {
    cy.visit("/bankaccounts");
    cy.getBySel("bankaccount-new").click();

    cy.getBySelLike("bankName-input").type("The").find("input").clear().blur();
    cy.get("#bankaccount-bankName-input-helper-text")
      .should("be.visible")
      .and("contain", "Enter a bank name");

    cy.getBySelLike("bankName-input").type("The").find("input").blur();
    cy.get("#bankaccount-bankName-input-helper-text")
      .should("be.visible")
      .and("contain", "Must contain at least 5 characters");

    /** Routing number input validations **/
    // Required field
    cy.getBySelLike("routingNumber-input").find("input").focus().blur();
    cy.get(`#bankaccount-routingNumber-input-helper-text`)
      .should("be.visible")
      .and("contain", "Enter a valid bank routing number");

    // Min 9 digit
    cy.getBySelLike("routingNumber-input").type("12345678").find("input").blur();
    cy.get("#bankaccount-routingNumber-input-helper-text")
      .should("be.visible")
      .and("contain", "Must contain a valid routing number");
    cy.getBySelLike("routingNumber-input").find("input").clear();

    cy.getBySelLike("routingNumber-input").type("123456789").find("input").blur();
    cy.get("#bankaccount-routingNumber-input-helper-text").should("not.exist");

    /** Account number input validations **/
    // Required field
    cy.getBySelLike("accountNumber-input").find("input").focus().blur();
    cy.get(`#bankaccount-accountNumber-input-helper-text`)
      .should("be.visible")
      .and("contain", "Enter a valid bank account number");

    // Min 9 digit
    cy.getBySelLike("accountNumber-input").type("12345678").find("input").blur();
    cy.get("#bankaccount-accountNumber-input-helper-text")
      .should("be.visible")
      .and("contain", "Must contain at least 9 digits");
    cy.getBySelLike("accountNumber-input").find("input").clear();

    cy.getBySelLike("accountNumber-input").type("123456789").find("input").blur();
    cy.get("#bankaccount-accountNumber-input-helper-text").should("not.exist");
    cy.getBySelLike("accountNumber-input").find("input").clear();

    // Max 12 gdigit
    cy.getBySelLike("accountNumber-input").type("123456789111").find("input").blur();
    cy.get("#bankaccount-accountNumber-input-helper-text").should("not.exist");
    cy.getBySelLike("accountNumber-input").find("input").clear();

    cy.getBySelLike("accountNumber-input").type("1234567891111").find("input").blur();
    cy.get("#bankaccount-accountNumber-input-helper-text")
      .should("be.visible")
      .and("contain", "Must contain no more than 12 digits");

    cy.getBySel("bankaccount-submit").should("be.disabled");
    cy.visualSnapshot("Bank Account Form with Errors and Submit button disabled");
  });

  it("soft deletes a bank account", function () {
    cy.visit("/bankaccounts");
    cy.getBySelLike("delete").first().click();

    cy.wait("@gqlDeleteBankAccountMutation");
    cy.getBySelLike("list-item").children().contains("Deleted");
    cy.visualSnapshot("Soft Delete Bank Account");
  });

  // TODO: [enhancement] the onboarding modal assertion can be removed after adding "onboarded" flag to user profile
  it("renders an empty bank account list state with onboarding modal", function () {
    cy.wait("@getNotifications");
    cy.intercept("POST", apiGraphQL, (req) => {
      const { body } = req;
      if (body.hasOwnProperty("operationName") && body.operationName === "ListBankAccount") {
        req.alias = "gqlListBankAccountQuery";
        req.continue((res) => {
          res.body.data.listBankAccount = [];
        });
      }
    });

    cy.visit("/bankaccounts");
    cy.wait("@getNotifications");
    cy.wait("@gqlListBankAccountQuery");

    cy.getBySel("bankaccount-list").should("not.exist");
    cy.getBySel("empty-list-header").should("contain", "No Bank Accounts");
    cy.getBySel("user-onboarding-dialog").should("be.visible");
    cy.getBySel("nav-top-notifications-count").should("exist");
    cy.visualSnapshot("User Onboarding Dialog is Visible");
  });
});
