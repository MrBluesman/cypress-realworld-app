import { isMobile } from "../../support/utils";
import { User, Transaction } from "../../../src/models";

type NotificationsCtx = {
  userA: User;
  userB: User;
  userC: User;
};

// You can find out more information about the custom Cypress commands used here:
// https://learn.cypress.io/real-world-examples/custom-cypress-commands

describe("Notifications", function () {
  const ctx = {} as NotificationsCtx;

  beforeEach(function () {
    // First, we are using a custom Cypress task to seed our database.
    cy.task("db:seed");

    // Then, we are using cy.intercept() to intercept several requests and aliasing them to be used
    // later on withing our tests.
    cy.intercept("GET", "/notifications*").as("getNotifications");
    cy.intercept("POST", "/transactions").as("createTransaction");
    cy.intercept("PATCH", "/notifications/*").as("updateNotification");
    cy.intercept("POST", "/comments/*").as("postComment");

    // Finally, we are using another custom Cypress command cy.database() to retrieve some users
    // from the database and store them on the ctx object. This object and these users will be used
    // later on within our tests. This is an example of "Data Driven Testing" where instead of
    // hard coding your data, you use real data from a remote source, which in this case is our database.
    cy.database("filter", "users").then((users: User[]) => {
      ctx.userA = users[0];
      ctx.userB = users[1];
      ctx.userC = users[2];
    });
  });

  describe("notifications from user interactions", function () {
    it("User A likes a transaction of User B; User B gets notification that User A liked transaction ", function () {
      cy.loginByXstate(ctx.userA.username);
      cy.wait("@getNotifications");

      cy.database("find", "transactions", { senderId: ctx.userB.id }).then(
        (transaction: Transaction) => {
          cy.visit(`/transaction/${transaction.id}`);
        }
      );

      cy.log("🚩 Renders the notifications badge with count");
      cy.wait("@getNotifications")
        .its("response.body.results.length")
        .then((notificationCount) => {
          cy.getBySel("nav-top-notifications-count").should("have.text", `${notificationCount}`);
        });
      cy.visualSnapshot("Renders the notifications badge with count");

      const likesCountSelector = "[data-test*=transaction-like-count]";
      cy.contains(likesCountSelector, 0);
      cy.getBySelLike("like-button").click();
      // a successful "like" should disable the button and increment
      // the number of likes
      cy.getBySelLike("like-button").should("be.disabled");
      cy.contains(likesCountSelector, 1);
      cy.visualSnapshot("Like Count Incremented");

      cy.switchUserByXstate(ctx.userB.username);
      cy.visualSnapshot(`Switch to User ${ctx.userB.username}`);

      cy.wait("@getNotifications")
        .its("response.body.results.length")
        .as("preDismissedNotificationCount");

      cy.visit("/notifications");

      cy.wait("@getNotifications");

      cy.getBySelLike("notification-list-item")
        .should("have.length", 9)
        .first()
        .should("contain", ctx.userA?.firstName)
        .and("contain", "liked");

      cy.log("🚩 Marks notification as read");
      cy.getBySelLike("notification-mark-read").first().click({ force: true });
      cy.wait("@updateNotification");

      cy.get("@preDismissedNotificationCount").then((count) => {
        cy.getBySelLike("notification-list-item").should("have.length.lessThan", Number(count));
      });
      cy.visualSnapshot("Notification count after notification dismissed");
    });

    it("User C likes a transaction between User A and User B; User A and User B get notifications that User C liked transaction", function () {
      cy.loginByXstate(ctx.userC.username);

      cy.database("find", "transactions", {
        senderId: ctx.userB.id,
        receiverId: ctx.userA.id,
      }).then((transaction: Transaction) => {
        cy.visit(`/transaction/${transaction.id}`);
      });

      const likesCountSelector = "[data-test*=transaction-like-count]";
      cy.contains(likesCountSelector, 0);
      cy.getBySelLike("like-button").click();
      cy.getBySelLike("like-button").should("be.disabled");
      cy.contains(likesCountSelector, 1);
      cy.visualSnapshot("Like Count Incremented");

      cy.switchUserByXstate(ctx.userA.username);
      cy.visualSnapshot(`Switch to User ${ctx.userA.username}`);

      cy.getBySelLike("notifications-link").click();

      cy.wait("@getNotifications");

      cy.location("pathname").should("equal", "/notifications");

      cy.getBySelLike("notification-list-item")
        .should("have.length", 9)
        .first()
        .should("contain", ctx.userC.firstName)
        .and("contain", "liked");
      cy.visualSnapshot("User A Notified of User B Like");

      cy.switchUserByXstate(ctx.userB.username);
      cy.visualSnapshot(`Switch to User ${ctx.userB.username}`);

      cy.getBySelLike("notifications-link").click();

      cy.wait("@getNotifications");

      cy.getBySelLike("notification-list-item")
        .should("have.length", 9)
        .first()
        .should("contain", ctx.userC.firstName)
        .and("contain", "liked");
      cy.visualSnapshot("User B Notified of User C Like");
    });

    it("User A comments on a transaction of User B; User B gets notification that User A commented on their transaction", function () {
      cy.loginByXstate(ctx.userA.username);
      cy.visualSnapshot("Logged in as user A");

      cy.database("find", "transactions", { senderId: ctx.userB.id }).then(
        (transaction: Transaction) => {
          cy.visit(`/transaction/${transaction.id}`);
        }
      );

      cy.getBySelLike("comment-input").type("Thank You{enter}");

      cy.wait("@postComment");

      cy.switchUserByXstate(ctx.userB.username);
      cy.visualSnapshot(`Switch to User ${ctx.userB.username}`);

      cy.getBySelLike("notifications-link").click();

      cy.wait("@getNotifications");

      cy.getBySelLike("notification-list-item")
        .should("have.length", 9)
        .first()
        .should("contain", ctx.userA?.firstName)
        .and("contain", "commented");
      cy.visualSnapshot("User A Notified of User B Comment");
    });

    // You can find out more information about the custom Cypress commands used here:
    // https://learn.cypress.io/real-world-examples/custom-cypress-commands
    it("User C comments on a transaction between User A and User B; User A and B get notifications that User C commented on their transaction", function () {
      // First, we log in as userC from the ctx object, which we set up in the beforeEach() hook
      // at the top of this spec file.
      cy.loginByXstate(ctx.userC.username);

      // Next, we yse a custom Cypress command cy.database() to find transactions between userB
      // and userC, which again come from the ctx object we setup in the beforeEach() hook
      // at the top of this spec file. After we find a transaction, we visit that specific
      // transaction page.
      cy.database("find", "transactions", {
        senderId: ctx.userB.id,
        receiverId: ctx.userA.id,
      }).then((transaction: Transaction) => {
        cy.visit(`/transaction/${transaction.id}`);
      });

      // Then, we enter a comment on the transaction page and wait on the @postComment intercept.
      // Remember, this intercept happens in the beforeEach() at the top of this spec file.
      cy.getBySelLike("comment-input").type("Thank You{enter}");
      cy.wait("@postComment");

      // Next, we switch users again, this time logging in a userA.
      cy.switchUserByXstate(ctx.userA.username);
      cy.visualSnapshot("Switch to User A");
      cy.visualSnapshot(`Switch to User ${ctx.userA.username}`);

      // Now that we are logged in as userA we click on the notifications button to view userA's
      // notifications. We also wait for the @getNotifications intercept. Remember, this intercept
      // happens in the beforeEach() at the top of this spec file.
      cy.getBySelLike("notifications-link").click();
      cy.wait("@getNotifications");

      // Then, we confirm our user has s total of 9 notifications and that the first notification
      // contains the first name of userC along with the text "commented".
      cy.getBySelLike("notification-list-item")
        .should("have.length", 9)
        .first()
        .should("contain", ctx.userC.firstName)
        .and("contain", "commented");
      cy.visualSnapshot("User A Notified of User C Comment");

      // We switch users yet again, this time logging in as userB.
      cy.switchUserByXstate(ctx.userB.username);
      cy.visualSnapshot(`Switch to User ${ctx.userB.username}`);

      // We then perform similar assertions like we just did for userA. We want to make sure that
      // userB has a total of 9 notifications and that the first notification contains the
      // first name of userC along with the text "commented".
      cy.getBySelLike("notifications-link").click();
      cy.getBySelLike("notification-list-item")
        .should("have.length", 9)
        .first()
        .should("contain", ctx.userC.firstName)
        .and("contain", "commented");
      cy.visualSnapshot("User B Notified of User C Comment");
    });

    it("User A sends a payment to User B", function () {
      cy.loginByXstate(ctx.userA.username);

      cy.getBySelLike("new-transaction").click();
      cy.createTransaction({
        transactionType: "payment",
        amount: 30,
        description: "🍕Pizza",
        sender: ctx.userA,
        receiver: ctx.userB,
      });
      cy.wait("@createTransaction");

      cy.switchUserByXstate(ctx.userB.username);
      cy.visualSnapshot(`Switch to User ${ctx.userB.username}`);

      cy.getBySelLike("notifications-link").click();
      cy.visualSnapshot("Navigate to Notifications");

      cy.getBySelLike("notification-list-item")
        .first()
        .should("contain", ctx.userB.firstName)
        .and("contain", "received payment");
      cy.visualSnapshot("User B Notified of Payment");
    });

    it("User A sends a payment request to User C", function () {
      cy.loginByXstate(ctx.userA.username);

      cy.getBySelLike("new-transaction").click();
      cy.createTransaction({
        transactionType: "request",
        amount: 300,
        description: "🛫🛬 Airfare",
        sender: ctx.userA,
        receiver: ctx.userC,
      });
      cy.wait("@createTransaction");

      cy.switchUserByXstate(ctx.userC.username);
      cy.visualSnapshot(`Switch to User ${ctx.userC.username}`);

      cy.getBySelLike("notifications-link").click();
      cy.getBySelLike("notification-list-item")
        .should("contain", ctx.userA.firstName)
        .and("contain", "requested payment");
      cy.visualSnapshot("User C Notified of Request from User A");
    });
  });

  // You can find out more information about the custom Cypress commands used here:
  // https://learn.cypress.io/real-world-examples/custom-cypress-commands
  it("renders an empty notifications state", function () {
    // First, we use cy.intercept(). to intercept any GET request to /notifications route.
    // If you look closely, we are also passing in an empty array [] as a 3rd argument which will
    // set the response data to be this empty array. The reason for this is we are trying to test
    // what happens when a user does not have any notifications. The intercept is aliased to @notifications.
    cy.intercept("GET", "/notifications", []).as("notifications");

    // Then, we use another custom Cypress command cy.loginByXstate() to log in as one of the users
    // which we retrieved in the beforeEach() hook at the top of this spec file.
    cy.loginByXstate(ctx.userA.username);

    // If this test is being run in a mobile viewport, we click on the button to toggle the sidebar.
    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }

    // Next, we click on the "Notifications" button in the sidebar and verify the app has routed us
    // to the notifications screen.
    cy.getBySel("sidenav-notifications").click();
    cy.location("pathname").should("equal", "/notifications");

    // Finally, we verify that there are not any notifications in the DOM and that the screen
    // displays the correct text letting the user know there are no notifications.
    cy.getBySel("notification-list").should("not.exist");
    cy.getBySel("empty-list-header").should("contain", "No Notifications");
    cy.visualSnapshot("No Notifications");
  });
});
