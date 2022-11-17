import { User, Transaction } from "../../../src/models";

type NewTransactionCtx = {
  transactionRequest?: Transaction;
  authenticatedUser?: User;
};

// You can find out more information about the custom Cypress commands used here:
// https://learn.cypress.io/real-world-examples/custom-cypress-commands

describe("Transaction View", function () {
  // The ctx object is an empty object that we will later populate within the beforeEach()
  // with some user data used through the tests in this file.
  const ctx: NewTransactionCtx = {};

  beforeEach(function () {
    // First, we are using a custom Cypress task to seed our database.
    cy.task("db:seed");

    // Next, we use cy.intercept() to intercept various requests and aliasing them.
    cy.intercept("GET", "/transactions*").as("personalTransactions");
    cy.intercept("GET", "/transactions/public*").as("publicTransactions");
    cy.intercept("GET", "/transactions/*").as("getTransaction");
    cy.intercept("PATCH", "/transactions/*").as("updateTransaction");

    cy.intercept("GET", "/checkAuth").as("userProfile");
    cy.intercept("GET", "/notifications").as("getNotifications");
    cy.intercept("GET", "/bankAccounts").as("getBankAccounts");

    // Then, we use a custom Cypress command cy.database() to retrieve the users from our database.
    // We then add this user to our ctx object and log in with cy.loginByXState().
    // We then perform another query to our database using cy.database() to find all of the "pending"
    // transactions for our user and store said pending transaction on the ctx object.
    cy.database("find", "users").then((user: User) => {
      ctx.authenticatedUser = user;

      cy.loginByXstate(ctx.authenticatedUser.username);

      cy.database("find", "transactions", {
        receiverId: ctx.authenticatedUser.id,
        status: "pending",
        requestStatus: "pending",
        requestResolvedAt: "",
      }).then((transaction: Transaction) => {
        ctx.transactionRequest = transaction;
      });
    });

    // Finally, we click on the personal transaction tab and wait on the @personalTransactions intercept.
    cy.getBySel("nav-personal-tab").click();
    cy.wait("@personalTransactions");
  });

  // You can find out more information about the custom Cypress commands used here:
  // https://learn.cypress.io/real-world-examples/custom-cypress-commands

  // This is a relatively straightforward test in which we are making sure that the transaction
  // navigation tabs are hidden on the transaction view page.
  it("transactions navigation tabs are hidden on a transaction view page", function () {
    // The first thing we do is click on the first transaction and confirm that the application
    // routes us to that transactions page.
    cy.getBySelLike("transaction-item").first().click();
    cy.location("pathname").should("include", "/transaction");

    // Finally, we confirm that the transaction tabs are not in the DOM and that
    // the transaction header is visible.
    cy.getBySel("nav-transaction-tabs").should("not.exist");
    cy.getBySel("transaction-detail-header").should("be.visible");
    cy.visualSnapshot("Transaction Navigation Tabs Hidden");
  });

  it("likes a transaction", function () {
    cy.getBySelLike("transaction-item").first().click();
    cy.wait("@getTransaction");

    cy.getBySelLike("like-button").click();
    cy.getBySelLike("like-count").should("contain", 1);
    cy.getBySelLike("like-button").should("be.disabled");
    cy.visualSnapshot("Transaction after Liked");
  });

  // You can find out more information about the custom Cypress commands used here:
  // https://learn.cypress.io/real-world-examples/custom-cypress-commands
  it("comments on a transaction", function () {
    // First, we click on the first transaction and wait upon the @getTransaction intercept.
    cy.getBySelLike("transaction-item").first().click();
    cy.wait("@getTransaction");

    // Next, we loop through the array of comments, typing in each one and ensuring
    // the comment is displayed in the UI.
    const comments = ["Thank you!", "Appreciate it."];

    comments.forEach((comment, index) => {
      cy.getBySelLike("comment-input").type(`${comment}{enter}`);
      cy.getBySelLike("comments-list").children().eq(index).contains(comment);
    });

    // Finally, we confirm that all of our comments in the comments array are displayed within the UI.
    cy.getBySelLike("comments-list").children().should("have.length", comments.length);
    cy.visualSnapshot("Comment on Transaction");
  });

  it("accepts a transaction request", function () {
    cy.visit(`/transaction/${ctx.transactionRequest!.id}`);
    cy.wait("@getTransaction");

    cy.getBySelLike("accept-request").click();
    cy.wait("@updateTransaction").its("response.statusCode").should("equal", 204);
    cy.getBySelLike("accept-request").should("not.exist");
    cy.getBySel("transaction-detail-header").should("be.visible");
    cy.visualSnapshot("Transaction Accepted");
  });

  // You can find out more information about the custom Cypress commands used here:
  // https://learn.cypress.io/real-world-examples/custom-cypress-commands
  it("rejects a transaction request", function () {
    // First, we visit the transaction screen for the specific transaction we looked up within
    // the beforeEach() hook at the top of the spec file. Then we wait upon the @getTransaction intercept.
    cy.visit(`/transaction/${ctx.transactionRequest!.id}`);
    cy.wait("@getTransaction");

    // Next, we click on the "Reject request" button and wait on the @updateTransaction intercept
    // and confirm that this intercepts status code is 204.
    cy.getBySelLike("reject-request").click();
    cy.wait("@updateTransaction").its("response.statusCode").should("equal", 204);

    // Finally, we make sure the reject request button is no longer in the DOM and that
    // the transaction detail header is visible.
    cy.getBySelLike("reject-request").should("not.exist");
    cy.getBySel("transaction-detail-header").should("be.visible");
    cy.visualSnapshot("Transaction Rejected");
  });

  it("does not display accept/reject buttons on completed request", function () {
    cy.database("find", "transactions", {
      receiverId: ctx.authenticatedUser!.id,
      status: "complete",
      requestStatus: "accepted",
    }).then((transactionRequest) => {
      cy.visit(`/transaction/${transactionRequest!.id}`);

      cy.wait("@getNotifications");
      cy.getBySel("nav-top-notifications-count").should("be.visible");
      cy.getBySel("transaction-detail-header").should("be.visible");
      cy.getBySel("transaction-accept-request").should("not.exist");
      cy.getBySel("transaction-reject-request").should("not.exist");
      cy.getBySel("transaction-detail-header").should("be.visible");
      cy.visualSnapshot("Transaction Completed (not able to accept or reject)");
    });
  });
});
