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
    // First, we wait upon our aliased intercept @getNotifications
    cy.wait("@getNotifications");

    // Next, we click on the "Bank Accounts" link in the left sidebar, depending upon if we are
    // a mobile device or not.
    // You can find out more info about isMobile() utility function here:
    // https://learn.cypress.io/real-world-examples/custom-cypress-commands
    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }

    cy.getBySel("sidenav-bankaccounts").click();

    // Next, we will click on the "Create" button and write an assertion that the application
    // has taken us to the correct screen by validating the URL.
    cy.getBySel("bankaccount-new").click();
    cy.location("pathname").should("eq", "/bankaccounts/new");
    cy.visualSnapshot("Display New Bank Account Form");

    // Then, we fill out the new bank account form with our bank account information and save it.
    cy.getBySelLike("bankName-input").type("The Best Bank");
    cy.getBySelLike("routingNumber-input").type("987654321");
    cy.getBySelLike("accountNumber-input").type("123456789");
    cy.visualSnapshot("Fill out New Bank Account Form");
    cy.getBySelLike("submit").click();

    // We then wait for our GraphQL mutation to create a new bank account.
    cy.wait("@gqlCreateBankAccountMutation");

    // Finally, we will write an assertion that ensures that our new bank account is created successfully.
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
    // First, we wait upon our aliased intercept @getNotifications
    cy.wait("@getNotifications");

    // Next, we use cy.intercept() to intercept the POST request to our GraphQL endpoint.
    // We then determine if the POST request is a GraphQL query to "ListBankAccount".
    // If so, we set the alias to gqlListBankAccountQuery.
    cy.intercept("POST", apiGraphQL, (req) => {
      const { body } = req;
      if (body.hasOwnProperty("operationName") && body.operationName === "ListBankAccount") {
        req.alias = "gqlListBankAccountQuery";

        // Then we clear out any listBankAccount items that come back by setting this property
        // on the response to an empty array. This is how we manipulate the response data
        // to ensure we "render an empty bank account list", which is necessary for our test.
        req.continue((res) => {
          res.body.data.listBankAccount = [];
        });
      }
    });

    // We then cy.visit() the /bankaccounts route.
    cy.visit("/bankaccounts");

    // Then we wait on two intercepts - one for @getNotifications and the other for @gqlListBankAccountQuery.
    // Remember the @getNotifications intercept happens in the beforeEach() hook.
    cy.wait("@getNotifications");
    cy.wait("@gqlListBankAccountQuery");

    // Finally, we write some assertions to make sure our UI is displaying the elements that it should.
    // We first want to ensure that the element that would normally display our bank accounts
    // does not exist in the DOM.
    cy.getBySel("bankaccount-list").should("not.exist");

    // Then, we make sure we are displaying the correct message since there are no bank accounts.
    cy.getBySel("empty-list-header").should("contain", "No Bank Accounts");

    // Next, we assert that the onboarding modal window is visible.
    cy.getBySel("user-onboarding-dialog").should("be.visible");

    // Finally, we assert that the user's notification count is visible.
    cy.getBySel("nav-top-notifications-count").should("exist");
    cy.visualSnapshot("User Onboarding Dialog is Visible");
  });
});
