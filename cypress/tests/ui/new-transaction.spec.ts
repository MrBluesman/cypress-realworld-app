import Dinero from "dinero.js";
import { User } from "../../../src/models";
import { isMobile } from "../../support/utils";

type NewTransactionTestCtx = {
  allUsers?: User[];
  user?: User;
  contact?: User;
};

// You can find out more information about the custom Cypress commands used here:
// https://learn.cypress.io/real-world-examples/custom-cypress-commands
describe("New Transaction", function () {
  const ctx: NewTransactionTestCtx = {};

  beforeEach(function () {
    // The first thing we are doing is seeding our database using a custom Cypress task.
    cy.task("db:seed");

    // Next, we are using cy.intercept() to intercept and alias several requests.
    cy.intercept("GET", "/users*").as("allUsers");
    cy.intercept("GET", "/users/search*").as("usersSearch");
    cy.intercept("POST", "/transactions").as("createTransaction");
    cy.intercept("GET", "/notifications").as("notifications");
    cy.intercept("GET", "/transactions/public").as("publicTransactions");
    cy.intercept("GET", "/transactions").as("personalTransactions");
    cy.intercept("PATCH", "/transactions/*").as("updateTransaction");

    // Next, we are using a custom Cypress command cy.database() to get some users from the database.
    // We then store some of this information in the ctx object.
    // Lastly, we log in as one of the users returned from the cy.database() command.
    cy.database("filter", "users").then((users: User[]) => {
      ctx.allUsers = users;
      ctx.user = users[0];
      ctx.contact = users[1];

      return cy.loginByXstate(ctx.user.username);
    });
  });

  it("navigates to the new transaction form, selects a user and submits a transaction payment", function () {
    // First, we create a simple payment object.
    const payment = {
      amount: "35",
      description: "Sushi dinner 🍣",
    };

    // Next, we click on the "New" transaction button
    cy.getBySelLike("new-transaction").click();

    // We then wait on our aliased intercept @allUsers.
    // Remember, this happens in the beforeEach() hook before this test is run.
    cy.wait("@allUsers");

    // Then we search for a user and wait on the @usersSearch intercept
    cy.getBySel("user-list-search-input").type(ctx.contact!.firstName, { force: true });
    cy.wait("@usersSearch");
    cy.visualSnapshot("User Search First Name Input");

    // We then make an assertion that the user that we just searched for appears in the search
    // results and then we click on that user to make a payment to them.
    cy.getBySelLike("user-list-item").contains(ctx.contact!.firstName).click({ force: true });
    cy.visualSnapshot("User Search First Name List Item");

    // On the payment screen we enter the payment amount and description and submit the payment.
    cy.getBySelLike("amount-input").type(payment.amount);
    cy.getBySelLike("description-input").type(payment.description);
    cy.visualSnapshot("Amount and Description Input");
    cy.getBySelLike("submit-payment").click();

    // We then wait upon two intercepts @createTransaction and @getUserProfile.
    // Notice how you can wait upon multiple intercepts by putting them into an array.
    cy.wait(["@createTransaction", "@getUserProfile"]);

    // Then we assert that the transaction was submitted successfully.
    cy.getBySel("alert-bar-success")
      .should("be.visible")
      .and("have.text", "Transaction Submitted!");

    // Next, we create a constant called updatedAccountBalance

    // We are using a 3rd party library called Dinero.js which handles currency formatting.
    // Since Cypress is just JavaScript, we can import this library and use it within our test.
    // https://dinerojs.com
    const updatedAccountBalance = Dinero({
      amount: ctx.user!.balance - parseInt(payment.amount) * 100,
    }).toFormat();

    // Then we use our isMobile() utility function to determine if our test is being run in
    // a mobile viewport. If so, we click on the button to toggle the sidebar.
    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }

    // We then make an assertion that the user's account balance has been updated to the correct amount
    // via the payment we just made.
    cy.getBySelLike("user-balance").should("contain", updatedAccountBalance);
    cy.visualSnapshot("Updated User Balance");

    if (isMobile()) {
      cy.get(".MuiBackdrop-root").click({ force: true });
    }

    // Next, we click on the "Create another Transaction" button.
    cy.getBySelLike("create-another-transaction").click();

    // Then we click on the app name logo in the header.
    cy.getBySel("app-name-logo").find("a").click();

    // Then we write an assertion to make sure one of the tabs in the app has the correct class.
    cy.getBySelLike("personal-tab").click().should("have.class", "Mui-selected");

    // Next, we wait upon the @personalTransactions intercept.
    cy.wait("@personalTransactions");

    // Then we write an assertion to ensure that the first transaction in the list contains
    // the correct description from the transaction we just made.
    cy.getBySel("transaction-list").first().should("contain", payment.description);

    // We then use the custom Cypress command cy.database() to find the user we just made the payment to
    // and assert that their balance in the database has been updated appropriately.
    cy.database("find", "users", { id: ctx.contact!.id })
      .its("balance")
      .should("equal", ctx.contact!.balance + parseInt(payment.amount) * 100);

    // Finally, we assert that the alert bar does not exist in the DOM.
    cy.getBySel("alert-bar-success").should("not.exist");
    cy.visualSnapshot("Personal List Validate Transaction in List");
  });

  it("navigates to the new transaction form, selects a user and submits a transaction request", function () {
    const request = {
      amount: "95",
      description: "Fancy Hotel 🏨",
    };

    cy.getBySelLike("new-transaction").click();
    cy.wait("@allUsers");

    cy.getBySelLike("user-list-item").contains(ctx.contact!.firstName).click({ force: true });
    cy.visualSnapshot("User Search First Name Input");

    cy.getBySelLike("amount-input").type(request.amount);
    cy.getBySelLike("description-input").type(request.description);
    cy.visualSnapshot("Amount and Description Input");
    cy.getBySelLike("submit-request").click();
    cy.wait("@createTransaction");
    cy.getBySel("alert-bar-success")
      .should("be.visible")
      .and("have.text", "Transaction Submitted!");
    cy.visualSnapshot("Transaction Request Submitted Notification");

    cy.getBySelLike("return-to-transactions").click();
    cy.getBySelLike("personal-tab").click().should("have.class", "Mui-selected");

    cy.getBySelLike("transaction-item").should("contain", request.description);
    cy.visualSnapshot("Transaction Item Description in List");
  });

  it("displays new transaction errors", function () {
    cy.getBySelLike("new-transaction").click();
    cy.wait("@allUsers");

    cy.getBySelLike("user-list-item").contains(ctx.contact!.firstName).click({ force: true });

    cy.getBySelLike("amount-input").type("43").find("input").clear().blur();
    cy.get("#transaction-create-amount-input-helper-text")
      .should("be.visible")
      .and("contain", "Please enter a valid amount");

    cy.getBySelLike("description-input").type("Fun").find("input").clear().blur();
    cy.get("#transaction-create-description-input-helper-text")
      .should("be.visible")
      .and("contain", "Please enter a note");

    cy.getBySelLike("submit-request").should("be.disabled");
    cy.getBySelLike("submit-payment").should("be.disabled");
    cy.visualSnapshot("New Transaction Errors with Submit Payment/Request Buttons Disabled");
  });

  it("submits a transaction payment and verifies the deposit for the receiver", function () {
    // First, we click on the "New" transaction button
    cy.getBySel("nav-top-new-transaction").click();

    // We then create a transactionPayload object
    const transactionPayload = {
      transactionType: "payment",
      amount: 25,
      description: "Indian Food",
      sender: ctx.user,
      receiver: ctx.contact,
    };

    // Then, we grab the current balance from the UI, only if we are not in a mobile viewport
    // and store it inside of the startBalance variable.

    // first let's grab the current balance from the UI
    let startBalance: string;
    if (!isMobile()) {
      // only check the balance display in desktop resolution
      // as it is NOT shown on mobile screen
      cy.get("[data-test=sidenav-user-balance]")
        .invoke("text")
        .then((x) => {
          startBalance = x; // something like "$1,484.81"
          expect(startBalance).to.match(/\$\d/);
        });
    }

    // We then create a new transaction using a custom Cypress command cy.createTransaction
    // with the transactionPayload object we created earlier.
    cy.createTransaction(transactionPayload);

    // We then wait on the @createTransaction intercept
    // and assert the "Create Another Transaction" is visible
    cy.wait("@createTransaction");
    cy.getBySel("new-transaction-create-another-transaction").should("be.visible");

    // We then make sure we are not in a mobile viewport and assert that the user balance
    // has been updated from the transaction we just created.
    if (!isMobile()) {
      // make sure the new balance is displayed
      cy.get("[data-test=sidenav-user-balance]").should(($el) => {
        // here we only make sure the text has changed
        // we could also convert the balance to actual number
        // and confirm the new balance is the start balance - amount
        expect($el.text()).to.not.equal(startBalance);
      });
    }
    cy.visualSnapshot("Transaction Payment Submitted Notification");

    // We then switch users by using a custom command cy.switchUserByXstate()
    cy.switchUserByXstate(ctx.contact!.username);

    // We then use a 3rd party library called Dinero.js to format the
    // updatedAccountBalance property.
    const updatedAccountBalance = Dinero({
      amount: ctx.contact!.balance + transactionPayload.amount * 100,
    }).toFormat();

    // If we are in a mobile viewport we click the button to open the sidebar.
    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }

    // Finally, we assert that the user's balance contains the correct amount.
    cy.getBySelLike("user-balance").should("contain", updatedAccountBalance);
    cy.visualSnapshot("Verify Updated Sender Account Balance");
  });

  it("submits a transaction request and accepts the request for the receiver", function () {
    const transactionPayload = {
      transactionType: "request",
      amount: 100,
      description: "Fancy Hotel",
      sender: ctx.user,
      receiver: ctx.contact,
    };

    cy.getBySelLike("new-transaction").click();
    cy.createTransaction(transactionPayload);
    cy.wait("@createTransaction");
    cy.getBySel("new-transaction-create-another-transaction").should("be.visible");
    cy.visualSnapshot("receiver - Transaction Payment Submitted Notification");

    cy.switchUserByXstate(ctx.contact!.username);

    cy.getBySelLike("personal-tab").click();

    cy.wait("@personalTransactions");

    cy.getBySelLike("transaction-item")
      .first()
      .should("contain", transactionPayload.description)
      .click({ force: true });
    cy.getBySel("transaction-detail-header").should("exist");
    cy.visualSnapshot("Navigate to Transaction Item");

    cy.getBySelLike("accept-request").click();
    cy.wait("@updateTransaction").its("response.statusCode").should("eq", 204);
    cy.getBySelLike("transaction-detail-header").should("be.visible");
    cy.getBySelLike("transaction-amount").should("be.visible");
    cy.getBySelLike("sender-avatar").should("be.visible");
    cy.getBySelLike("receiver-avatar").should("be.visible");
    cy.getBySelLike("transaction-description").should("be.visible");
    cy.visualSnapshot("Accept Transaction Request");

    cy.switchUserByXstate(ctx.user!.username);

    const updatedAccountBalance = Dinero({
      amount: ctx.user!.balance + transactionPayload.amount * 100,
    }).toFormat();

    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }

    cy.getBySelLike("user-balance").should("contain", updatedAccountBalance);
    cy.visualSnapshot("Verify Updated Sender Account Balance");
  });

  context("searches for a user by attribute", function () {
    // First, we create a searchAttrs array that contains all of the user attributes
    // we intend to search for
    const searchAttrs: (keyof User)[] = [
      "firstName",
      "lastName",
      "username",
      "email",
      "phoneNumber",
    ];

    // Next we have a beforeEach() hook that clicks on the "New" transaction button and waits for
    // our @allUsers intercept. Remember, this intercept occurs in the beforeEach hook at the top
    // of this spec file.
    beforeEach(function () {
      cy.getBySelLike("new-transaction").click();
      cy.wait("@allUsers");
    });

    // Then, we are looping through the searchAttrs array to dynamically create our tests,
    // one for each attribute in the array. Remember that Cypress is just JavaScript,
    // which allows us to dynamically generate our tests instead of manually creating a test
    // for each attribute.
    searchAttrs.forEach((attr: keyof User) => {
      // Within our .forEach(), you can see that the first thing we do is create our .it()
      // test and pass in the attribute as the test name.
      it(attr, function () {
        // Next, we grab a user from our ctx object created in the .beforeEach() at the top
        // of this spec file.
        const targetUser = ctx.allUsers![2];

        // Then we use cy.log() to output a custom message to the Cypress Command Log in the test runner.
        // This makes it easy for us to see what is happening in the test runner
        // and is helpful for debugging.
        cy.log(`Searching by **${attr}**`);

        // We then perform a search for the specific attribute.
        cy.getBySel("user-list-search-input").type(targetUser[attr] as string, { force: true });

        // Next, we wait upon the @usersSearch intercept, which occurs in the .beforeEach()
        // at the top of the spec file.
        cy.wait("@usersSearch")
          // Then we grab the results from the response.body and write an assertion to make sure
          // we have some results, i.e the results array should not be empty.

          // make sure the backend returns some results
          .its("response.body.results")
          .should("have.length.gt", 0)
          .its("length")
          .then((resultsN) => {
            // Then, we get the .length of the results array and write an assertion to make sure
            // our UI displays the correct number of results returned from our back-end.
            // We also have an assertion that the first item displayed in the search is
            // the attribute we searched for.

            cy.getBySelLike("user-list-item")
              // make sure the list of results is fully updated
              // and shows the number of results returned from the backend
              .should("have.length", resultsN)
              .first()
              .contains(targetUser[attr] as string);
          });

        cy.visualSnapshot(`User List for Search: ${attr} = ${targetUser[attr]}`);

        // Finally, we clear focused input & make sure that the users list is empty.
        cy.focused().clear();
        cy.getBySel("users-list").should("be.empty");
        cy.visualSnapshot("User List Clear Search");
      });
    });
  });
});
