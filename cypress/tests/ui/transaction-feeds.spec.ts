import Dinero from "dinero.js";
import {
  User,
  Transaction,
  TransactionRequestStatus,
  TransactionResponseItem,
  Contact,
  TransactionStatus,
} from "../../../src/models";
import { addDays, isWithinInterval, startOfDay } from "date-fns";
import { startOfDayUTC, endOfDayUTC } from "../../../src/utils/transactionUtils";
import { isMobile } from "../../support/utils";

const { _ } = Cypress;

type TransactionFeedsCtx = {
  allUsers?: User[];
  user?: User;
  contactIds?: string[];
};

describe("Transaction Feed", function () {
  // ctx & feedViews Objects

  // The ctx object is an empty object that we will later populate within beforeEach() below
  // with some user data used through the tests in this file.
  const ctx: TransactionFeedsCtx = {};

  // The feedViews object contains various information for the different views depending upon
  // which transaction feed we are testing.
  const feedViews = {
    // For example, for the public feed views object.
    // - The tab property is the name of the selector we will use to grab the correct element.
    // - The tabLabel is the text contained within the <label> element for the tab.
    // - The routeAlias is the alias name we are using for cy.intercept().
    // - The service is the name of the service we are using for a custom Cypress command
    //   cy.nextTransactionFeedPage(feed.service, pageData.totalPages); around line 203.
    public: {
      tab: "public-tab",
      tabLabel: "everyone",
      routeAlias: "publicTransactions",
      service: "publicTransactionService",
    },
    contacts: {
      tab: "contacts-tab",
      tabLabel: "friends",
      routeAlias: "contactsTransactions",
      service: "contactTransactionService",
    },
    personal: {
      tab: "personal-tab",
      tabLabel: "mine",
      routeAlias: "personalTransactions",
      service: "personalTransactionService",
    },
  };

  beforeEach(function () {
    // First, we are using a custom Cypress task to seed our database.
    cy.task("db:seed");

    // Next, we use cy.intercept() to intercept various requests and alias them
    // using the data within the feedViews object.
    cy.intercept("GET", "/notifications").as("notifications");
    cy.intercept("GET", "/transactions*").as(feedViews.personal.routeAlias);
    cy.intercept("GET", "/transactions/public*").as(feedViews.public.routeAlias);
    cy.intercept("GET", "/transactions/contacts*").as(feedViews.contacts.routeAlias);

    // Then, we use a custom Cypress command cy.database() to retrieve some users from the database.
    cy.database("filter", "users").then((users: User[]) => {
      // We then use the users returned from the database and add them to our ctx object later in our tests.
      ctx.user = users[0];
      ctx.allUsers = users;

      // Finally, we are using another custom Cypress command cy.loginByXstate() to login as
      // one of the users returned from the database.
      cy.loginByXstate(ctx.user.username);
    });
  });

  // You can find out more information about the custom Cypress commands used in this test here:
  // https://learn.cypress.io/real-world-examples/custom-cypress-commands

  // This test is relatively straightforward, and we will not be covering every single line.
  // The general purpose of this test is to make sure that certain elements are either visible
  // or invisible depending upon whether we are in a mobile viewport of not.
  // We also use several cy.visualSnapshot() to confirm that our UI has not changed.
  // Tests like these are essential as they demonstrate the importance of testing what is there
  // and what should not be there. Remember, you dont want to only test for the positive
  // or "happy paths"; you also want to test the negative or "unhappy paths."
  describe("app layout and responsiveness", function () {
    it("toggles the navigation drawer", function () {
      // The first thing we are doing is waiting on a couple of intercepts that occur
      // in the beforeEach() hook.
      cy.wait("@notifications");
      cy.wait("@publicTransactions");

      // Next, we use our isMobile() utility method to determine if this test is being run
      // in a mobile viewport or not.
      if (isMobile()) {
        // If we are in a mobile viewport, then we verify the certain elements are visible
        // or not visible when we click on various buttons.
        cy.getBySel("sidenav-home").should("not.exist");
        cy.visualSnapshot("Mobile Initial Side Navigation Not Visible");
        cy.getBySel("sidenav-toggle").click();
        cy.getBySel("sidenav-home").should("be.visible");
        cy.visualSnapshot("Mobile Toggle Side Navigation Visible");
        cy.get(".MuiBackdrop-root").click({ force: true });
        cy.getBySel("sidenav-home").should("not.exist");
        cy.visualSnapshot("Mobile Home Link Side Navigation Not Visible");

        cy.getBySel("sidenav-toggle").click();
        cy.getBySel("sidenav-home").click().should("not.exist");
        cy.visualSnapshot("Mobile Toggle Side Navigation Not Visible");
      } else {
        // If we are not in a mobile viewport, then verify that certain elements are visible
        // or not for desktop and greater viewports.
        cy.getBySel("sidenav-home").should("be.visible");
        cy.visualSnapshot("Desktop Side Navigation Visible");
        cy.getBySel("sidenav-toggle").click();
        cy.getBySel("sidenav-home").should("not.be.visible");
        cy.visualSnapshot("Desktop Side Navigation Not Visible");
      }
    });
  });

  // You can find out more information about the custom Cypress commands used in this test here:
  // https://learn.cypress.io/real-world-examples/custom-cypress-commands
  describe("renders and paginates all transaction feeds", function () {
    it("renders transactions item variations in feed", function () {
      // First, we are using cy.intercept() to intercept any GET request to the
      // transactions/public* route.
      cy.intercept("GET", "/transactions/public*", {
        // We are also adding two additional headers to the response's headers. These headers will be
        // appended to the original response headers, leaving the original ones intact.
        headers: {
          "X-Powered-By": "Express",
          Date: new Date().toString(),
        },
        // We are then using a fixture to mock the response's payload.
        // This fixture can be found inside of cypress/fixtures.
        fixture: "public-transactions.json",
      }).as("mockedPublicTransactions");

      // Then we visit the root route to trigger the GET request to /transactions/public
      // Visit page again to trigger call to /transactions/public
      cy.visit("/");

      // Next, we wait for two intercepts.
      cy.wait("@notifications");

      // We then grab the results from the @mockedPublicTransactions intercept.
      // Remember, these results are coming from our public-transactions.json fixture.
      // .its(response.body.results)
      cy.wait("@mockedPublicTransactions")
        .its("response.body.results")
        .then((transactions) => {
          // Then, we have a function called getTransactionFromEl which finds the transactionID
          // from the transaction element in the DOM. This function is a little complicated,
          // so let's break it down line by line.
          const getTransactionFromEl = ($el: JQuery<Element>): TransactionResponseItem => {
            // Our function getTransactionFromEl accepts a jQuery element as a parameter
            // and returns a TransactionResponseItem which is a TypeScript interface which
            // can be found in /src/models/transaction.ts around line 50.

            // Next, we get the transactionID from the data-test attribute from the DOM.
            // For example the HTML for one of our transactions looks like this:

            // <li
            //     class="MuiListItem-root MuiListItem-gutters MuiListItem-alignItemsFlexStart"
            //   data-test="transaction-item-183VHWyuQMS">

            // Once we have the string located within the data-test attrivute, we use .split()
            // to grab the transaction ID

            // "transaction-item-183VHWyuQMS".split("transaction-item-")[1]
            // 183VHWyuQMS
            const transactionId = $el.data("test").split("transaction-item-")[1];

            // Then, we use _.find() from Lodash https://lodash.com/docs/4.17.15#find
            // to locate the transaction from the @mockedPublicTransactions request
            // using the ID we just located from the DOM.
            return _.find(transactions, (transaction) => {
              return transaction.id === transactionId;
            })!;
          };

          // We then use cy.log() to output a custom message to the Cypress Command Log.
          cy.log("🚩Testing a paid payment transaction item");

          // Next, we are looking for a "paid" transaction, which in this case is the first transaction in the list.
          cy.contains("[data-test*='transaction-item']", "paid").within(($el) => {
            // We then grab the transaction with our getTransactionFromEl function.
            // Remember, this is going to return the transaction from our intercepted response,
            // which is a fixture,

            // Here is the transaction from the fixture:
            // {
            //       "amount": 8647,
            //       "balanceAtCompletion": 8958,
            //       "createdAt": "2019-12-10T21:38:16.311Z",
            //       "description": "Payment: db4uxOm7d to IMbeyzHTj9",
            //       "id": "si_aNEMbyCA",
            //       "modifiedAt": "2020-05-06T08:15:48.263Z",
            //       "privacyLevel": "private",
            //       "receiverId": "IMbeyzHTj9",
            //       "requestResolvedAt": "2020-06-09T19:01:15.675Z",
            //       "requestStatus": "",
            //       "senderId": "db4uxOm7d",
            //       "source": "GYDJUNEaOK7",
            //       "status": "complete",
            //       "uuid": "41754166-ea5b-448a-9a8a-374ce387c714",
            //       "receiverName": "Kevin",
            //       "senderName": "Amir",
            //       "likes": [],
            //       "comments": []
            // },
            const transaction = getTransactionFromEl($el);

            // Then we use a 3rd part library called Dinero.js https://dinerojs.com
            // to properly format the amount.

            // This will convert the "amount": 8647 from the fixture above to $86.47
            const formattedAmount = Dinero({
              amount: transaction.amount,
            }).toFormat();

            // Then we write an expectation asserting that our transactions status must be either
            // "pending" or "complete". Both of these statuses are coming from a TypeScript enum
            // which can be found in src/models/transaction.ts around line 4.

            // export enum TransactionStatus {
            //   pending = "pending",
            //   incomplete = "incomplete",
            //   complete = "complete",
            // }
            expect([TransactionStatus.pending, TransactionStatus.complete]).to.include(
              transaction.status
            );

            // We then write another assertion to make sure that the requestStatus is empty.
            expect(transaction.requestStatus).to.be.empty;

            // We then have a couple assertions to make sure that the UI's likes and comment count are correct.
            cy.getBySelLike("like-count").should("have.text", `${transaction.likes.length}`);
            cy.getBySelLike("comment-count").should("have.text", `${transaction.comments.length}`);

            // Next, we confirm that the sender and receiver of the transactions are the correct persons.
            cy.getBySelLike("sender").should("contain", transaction.senderName);
            cy.getBySelLike("receiver").should("contain", transaction.receiverName);

            // Finally, we are asserting that the amount displayed in the DOM is correct and has
            // the correct css. In this case of this transaction amount, since it is negative,
            // the UI should display a "-" before the dollar amount and make it red.
            cy.getBySelLike("amount")
              .should("contain", `-${formattedAmount}`)
              .should("have.css", "color", "rgb(255, 0, 0)");
          });

          // Now that you understand how we are testing for "paid" transaction items, you can see
          // we are more or less doing the same thing for both "charged" and "requested" transactions
          // in the rest of the test.

          cy.log("🚩Testing a charged payment transaction item");
          cy.contains("[data-test*='transaction-item']", "charged").within(($el) => {
            const transaction = getTransactionFromEl($el);
            const formattedAmount = Dinero({
              amount: transaction.amount,
            }).toFormat();

            expect(TransactionStatus.complete).to.equal(transaction.status);

            expect(transaction.requestStatus).to.equal(TransactionRequestStatus.accepted);

            cy.getBySelLike("amount")
              .should("contain", `+${formattedAmount}`)
              .should("have.css", "color", "rgb(76, 175, 80)");
          });

          cy.log("🚩Testing a requested payment transaction item");
          cy.contains("[data-test*='transaction-item']", "requested").within(($el) => {
            const transaction = getTransactionFromEl($el);
            const formattedAmount = Dinero({
              amount: transaction.amount,
            }).toFormat();

            expect([TransactionStatus.pending, TransactionStatus.complete]).to.include(
              transaction.status
            );
            expect([
              TransactionRequestStatus.pending,
              TransactionRequestStatus.rejected,
            ]).to.include(transaction.requestStatus);

            cy.getBySelLike("amount")
              .should("contain", `+${formattedAmount}`)
              .should("have.css", "color", "rgb(76, 175, 80)");
          });
          cy.visualSnapshot("Transaction Item");
        });
    });

    _.each(feedViews, (feed, feedName) => {
      it(`paginates ${feedName} transaction feed`, function () {
        cy.getBySelLike(feed.tab)
          .click()
          .should("have.class", "Mui-selected")
          .contains(feed.tabLabel, { matchCase: false })
          .should("have.css", { "text-transform": "uppercase" });
        cy.getBySel("list-skeleton").should("not.exist");
        cy.visualSnapshot(`Paginate ${feedName}`);

        cy.wait(`@${feed.routeAlias}`)
          .its("response.body.results")
          .should("have.length", Cypress.env("paginationPageSize"));

        // Temporary fix: https://github.com/cypress-io/cypress-realworld-app/issues/338
        if (isMobile()) {
          cy.wait(10);
        }

        cy.log("📃 Scroll to next page");
        cy.getBySel("transaction-list").children().scrollTo("bottom");

        cy.wait(`@${feed.routeAlias}`)
          .its("response.body")
          .then(({ results, pageData }) => {
            expect(results).have.length(Cypress.env("paginationPageSize"));
            expect(pageData.page).to.equal(2);
            cy.visualSnapshot(`Paginate ${feedName} Next Page`);
            cy.nextTransactionFeedPage(feed.service, pageData.totalPages);
          });

        cy.wait(`@${feed.routeAlias}`)
          .its("response.body")
          .then(({ results, pageData }) => {
            expect(results).to.have.length.least(1);
            expect(pageData.page).to.equal(pageData.totalPages);
            expect(pageData.hasNextPages).to.equal(false);
            cy.visualSnapshot(`Paginate ${feedName} Last Page`);
          });
      });
    });
  });

  // You can find out more information about the custom Cypress commands used in this test here:
  // https://learn.cypress.io/real-world-examples/custom-cypress-commands

  describe("filters transaction feeds by date range", function () {
    // First, we are checking to see if our test is being run inside of a mobile viewport.
    // If so, we ensure that the data range picker works properly on a mobile device by clicking
    // on it to open it, confirming that it is open, and then closing it.
    if (isMobile()) {
      it("closes date range picker modal", () => {
        cy.getBySelLike("filter-date-range-button").click({ force: true });
        cy.get(".Cal__Header__root").should("be.visible");
        cy.visualSnapshot("Mobile Open Date Range Picker");
        cy.getBySel("date-range-filter-drawer-close").click();
        cy.get(".Cal__Header__root").should("not.exist");
        cy.visualSnapshot("Mobile Close Date Range Picker");
      });
    }

    // Next, we loop through each property inside the feedViews object, which we defined
    // in the beforeEach() at the top of the spec file.

    // const feedViews = {
    //     public: {
    //       tab: "public-tab",
    //       tabLabel: "everyone",
    //       routeAlias: "publicTransactions",
    //       service: "publicTransactionService",
    //     },
    //     contacts: {
    //       tab: "contacts-tab",
    //       tabLabel: "friends",
    //       routeAlias: "contactsTransactions",
    //       service: "contactTransactionService",
    //     },
    //     personal: {
    //       tab: "personal-tab",
    //       tabLabel: "mine",
    //       routeAlias: "personalTransactions",
    //       service: "personalTransactionService",
    //     },
    //   };
    _.each(feedViews, (feed, feedName) => {
      // We then create a test for each feedView dynamically.
      it(`filters ${feedName} transaction feed by date range`, function () {
        // Next, we use a custom Cypress command cy.database() to find some transactions from the database.
        cy.database("find", "transactions").then((transaction: Transaction) => {
          const dateRangeStart = startOfDay(new Date(transaction.createdAt));
          const dateRangeEnd = endOfDayUTC(addDays(dateRangeStart, 1));

          // Then, we click on the appropriate tab for our feed.
          cy.getBySelLike(feed.tab).click().should("have.class", "Mui-selected");

          // Next we wait on the intercept associated with the feed.
          cy.wait(`@${feed.routeAlias}`).its("response.body.results").as("unfilteredResults");

          // Next, we use another custom Cypress command cy.pickDateRange() to pick select the dates we want.
          cy.pickDateRange(dateRangeStart, dateRangeEnd);

          // Then, we wait on the intercept associated with the feed and grab the resylts from the response.
          cy.wait(`@${feed.routeAlias}`)
            .its("response.body.results")
            .then((transactions: Transaction[]) => {
              // We then confirm that all of the results are displayed in the UI
              cy.getBySelLike("transaction-item").should("have.length", transactions.length);

              // Then we loop through all of the transactions and make sure that all of
              // the transaction dates are within the correct range.

              // - startOfDayUTC is a utility function that can be found in src/utils/transactionUtils.ts
              // - isWithinInterval is a function from the date-fns library. https://date-fns.org
              transactions.forEach(({ createdAt }) => {
                const createdAtDate = startOfDayUTC(new Date(createdAt));

                expect(
                  isWithinInterval(createdAtDate, {
                    start: startOfDayUTC(dateRangeStart),
                    end: dateRangeEnd,
                  }),
                  `transaction created date (${createdAtDate.toISOString()}) 
                  is within ${dateRangeStart.toISOString()} 
                  and ${dateRangeEnd.toISOString()}`
                ).to.equal(true);
              });

              cy.visualSnapshot("Date Range Filtered Transactions");
            });

          // We then use cy.log() to output a custom message to the Cypress Command Log.
          cy.log("Clearing date range filter. Data set should revert");

          // Next, we clear the date range picker.
          cy.getBySelLike("filter-date-clear-button").click({
            force: true,
          });
          cy.getBySelLike("filter-date-range-button").should("contain", "ALL");

          // Finally, we make sure that all of the transactions are displayed now that we have
          // cleared the date range picker, meaning that we are no longer filtering the results.
          cy.get("@unfilteredResults").then((unfilteredResults) => {
            cy.wait(`@${feed.routeAlias}`)
              .its("response.body.results")
              .should("deep.equal", unfilteredResults);
            cy.visualSnapshot("Unfiltered Transactions");
          });
        });
      });

      it(`does not show ${feedName} transactions for out of range date limits`, function () {
        const dateRangeStart = startOfDay(new Date(2014, 1, 1));
        const dateRangeEnd = endOfDayUTC(addDays(dateRangeStart, 1));

        cy.getBySelLike(feed.tab).click();
        cy.wait(`@${feed.routeAlias}`);

        cy.pickDateRange(dateRangeStart, dateRangeEnd);
        cy.wait(`@${feed.routeAlias}`);

        cy.getBySelLike("transaction-item").should("have.length", 0);
        cy.getBySel("empty-list-header").should("contain", "No Transactions");
        cy.getBySelLike("empty-create-transaction-button")
          .should("have.attr", "href", "/transaction/new")
          .contains("create a transaction", { matchCase: false })
          .should("have.css", { "text-transform": "uppercase" });
        cy.visualSnapshot("No Transactions");
      });
    });
  });

  describe("filters transaction feeds by amount range", function () {
    const dollarAmountRange = {
      min: 200,
      max: 800,
    };

    _.each(feedViews, (feed, feedName) => {
      it(`filters ${feedName} transaction feed by amount range`, function () {
        cy.getBySelLike(feed.tab).click({ force: true }).should("have.class", "Mui-selected");

        cy.wait(`@${feed.routeAlias}`).its("response.body.results").as("unfilteredResults");

        cy.setTransactionAmountRange(dollarAmountRange.min, dollarAmountRange.max);

        cy.getBySelLike("filter-amount-range-text").should(
          "contain",
          `$${dollarAmountRange.min} - $${dollarAmountRange.max}`
        );

        // @ts-ignore
        cy.wait(`@${feed.routeAlias}`).then(({ response: { body, url } }) => {
          const transactions = body.results as TransactionResponseItem[];
          const urlParams = new URLSearchParams(_.last(url.split("?")));

          const rawAmountMin = dollarAmountRange.min * 100;
          const rawAmountMax = dollarAmountRange.max * 100;

          expect(urlParams.get("amountMin")).to.equal(`${rawAmountMin}`);
          expect(urlParams.get("amountMax")).to.equal(`${rawAmountMax}`);

          cy.visualSnapshot("Amount Range Filtered Transactions");
          transactions.forEach(({ amount }) => {
            expect(amount).to.be.within(rawAmountMin, rawAmountMax);
          });
        });

        cy.getBySelLike("amount-clear-button").click();

        if (isMobile()) {
          cy.getBySelLike("amount-range-filter-drawer-close").click();
          cy.getBySel("amount-range-filter-drawer").should("not.exist");
        } else {
          cy.getBySel("transaction-list-filter-amount-clear-button").click();
          cy.getBySel("main").scrollTo("top");
          cy.getBySel("transaction-list-filter-date-range-button").click({ force: true });
          cy.getBySel("transaction-list-filter-amount-range").should("not.be.visible");
        }

        cy.get("@unfilteredResults").then((unfilteredResults) => {
          cy.wait(`@${feed.routeAlias}`)
            .its("response.body.results")
            .should("deep.equal", unfilteredResults);
          cy.visualSnapshot("Unfiltered Transactions");
        });
      });

      it(`does not show ${feedName} transactions for out of range amount limits`, function () {
        cy.getBySelLike(feed.tab).click();
        cy.wait(`@${feed.routeAlias}`);

        cy.setTransactionAmountRange(550, 1000);
        cy.getBySelLike("filter-amount-range-text").should("contain", "$550 - $1,000");
        cy.wait(`@${feed.routeAlias}`);

        cy.getBySelLike("transaction-item").should("have.length", 0);
        cy.getBySel("empty-list-header").should("contain", "No Transactions");
        cy.getBySelLike("empty-create-transaction-button")
          .should("have.attr", "href", "/transaction/new")
          .contains("create a transaction", { matchCase: false })
          .should("have.css", { "text-transform": "uppercase" });
        cy.visualSnapshot("No Transactions");
      });
    });
  });

  describe("Feed Item Visibility", () => {
    // You can find out more information about the custom Cypress commands used in this test here:
    // https://learn.cypress.io/real-world-examples/custom-cypress-commands
    it("mine feed only shows personal transactions", function () {
      // First, we are using a custom Cypress command cy.database() to filter through the contacts
      // of the user from the ctx object. Remember, the ctx object's data is setup
      // in the beforeEach() hook at the top of this spec file.
      // We .map() over all of the user's contacts and store their id's in the ctx object.
      cy.database("filter", "contacts", { userId: ctx.user!.id }).then((contacts: Contact[]) => {
        ctx.contactIds = contacts.map((contact) => contact.contactUserId);
      });

      // Next, we click on the personal feed view tab
      cy.getBySelLike(feedViews.personal.tab).click();

      // Then, we wait upon the @personalTransactions intercept, grab the results from the body
      // of the response and iterate over each transaction. We then make an assertion to make sure
      // the response only returns transactions associated with our user.
      cy.wait("@personalTransactions")
        .its("response.body.results")
        .each((transaction: Transaction) => {
          const transactionParticipants = [transaction.senderId, transaction.receiverId];
          expect(transactionParticipants).to.include(ctx.user!.id);
        });

      // Finally, we make sure that the loading skeleton does not exist in the DOM.
      cy.getBySel("list-skeleton").should("not.exist");
      cy.visualSnapshot("Personal Transactions");
    });

    it("first five items belong to contacts in public feed", function () {
      cy.database("filter", "contacts", { userId: ctx.user!.id }).then((contacts: Contact[]) => {
        ctx.contactIds = contacts.map((contact) => contact.contactUserId);
      });

      cy.wait("@publicTransactions")
        .its("response.body.results")
        .invoke("slice", 0, 5)
        .each((transaction: Transaction) => {
          const transactionParticipants = [transaction.senderId, transaction.receiverId];

          const contactsInTransaction = _.intersection(transactionParticipants, ctx.contactIds!);
          const message = `"${contactsInTransaction}" are contacts of ${ctx.user!.id}`;
          expect(contactsInTransaction, message).to.not.be.empty;
        });
      cy.getBySel("list-skeleton").should("not.exist");
      cy.visualSnapshot("First 5 Transaction Items belong to contacts");
    });

    it("friends feed only shows contact transactions", function () {
      cy.database("filter", "contacts", { userId: ctx.user!.id }).then((contacts: Contact[]) => {
        ctx.contactIds = contacts.map((contact) => contact.contactUserId);
      });

      cy.getBySelLike(feedViews.contacts.tab).click();

      cy.wait("@contactsTransactions")
        .its("response.body.results")
        .each((transaction: Transaction) => {
          const transactionParticipants = [transaction.senderId, transaction.receiverId];

          const contactsInTransaction = _.intersection(ctx.contactIds!, transactionParticipants);

          const message = `"${contactsInTransaction}" are contacts of ${ctx.user!.id}`;
          expect(contactsInTransaction, message).to.not.be.empty;
        });
      cy.getBySel("list-skeleton").should("not.exist");
      cy.visualSnapshot("Friends Feed only shows contacts transactions");
    });
  });
});
