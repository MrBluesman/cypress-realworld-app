import { User } from "../../../src/models";
import { isMobile } from "../../support/utils";

const apiGraphQL = `${Cypress.env("apiUrl")}/graphql`;

describe("User Sign-up and Login", function () {
  beforeEach(function () {
    // The first thing that happens inside of this hook is a custom task we have created
    // called db:seed which is responsible for seeding our database
    cy.task("db:seed");

    // Next we are using cy.intercept() to intercept every POST request to the /users route.
    // We are then aliasing this intercept to "signup". When you see @signup being used within a test
    // it is referring to this intercept.
    cy.intercept("POST", "/users").as("signup");

    // Finally, we are using cy.intercept() to intercept every POST request to our GraphQL API endpoint.
    // Within the body of this intercept, we have a conditional to check to see if the GraphQL
    // operationName is equal to "CreateBankAccount", if so, we are creating an alias to this
    // intercept as gqlCreateBankAccountMutation. When you see @gqlCreateBankAccountMutation being
    // used within a test, it is referring to this intercept.
    cy.intercept("POST", apiGraphQL, (req) => {
      const { body } = req;

      if (body.hasOwnProperty("operationName") && body.operationName === "CreateBankAccount") {
        req.alias = "gqlCreateBankAccountMutation";
      }
    });
  });

  it("should redirect unauthenticated user to signin page", function () {
    // First, we attempt to cy.visit() the URL /personal, a protected route that only logged-in
    // users can access.
    cy.visit("/personal");

    // Finally, we assert that the application redirects users who are not logged in
    // back to the /signin page.
    cy.location("pathname").should("equal", "/signin");
    cy.visualSnapshot("Redirect to SignIn");
  });

  it("should redirect to the home page after login", function () {
    cy.database("find", "users").then((user: User) => {
      cy.login(user.username, "s3cret", { rememberUser: true });
    });
    cy.location("pathname").should("equal", "/");
  });

  it("should remember a user for 30 days after login", function () {
    cy.database("find", "users").then((user: User) => {
      cy.login(user.username, "s3cret", { rememberUser: true });
    });

    // Verify Session Cookie
    cy.getCookie("connect.sid").should("have.property", "expiry");

    // Logout User
    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }
    cy.getBySel("sidenav-signout").click();
    cy.location("pathname").should("eq", "/signin");
    cy.visualSnapshot("Redirect to SignIn");
  });

  it("should allow a visitor to sign-up, login, and logout", function () {
    const userInfo = {
      firstName: "Bob",
      lastName: "Ross",
      username: "PainterJoy90",
      password: "s3cret",
    };

    // Sign-up User

    // First we navigate to the application root route, which will redirect us
    // to the sign in page.

    // By doing this, we are also confirming that our redirects are working as well.
    cy.visit("/");

    // Next, we click on the "Sign Up" link
    cy.getBySel("signup").click();

    // We then assert that the sign-up title is visible and contains "Sign Up."

    // This will ensure that we are correctly routed to the sign-up page after clicking on the sign-uo link.
    cy.getBySel("signup-title").should("be.visible").and("contain", "Sign Up");
    cy.visualSnapshot("Sign Up Title");

    // Sign Up Form
    // Next, we declare a userInfo object since we will be using this data across multiple forms
    // and expectations. Then, we fill out the sign-up form.
    cy.getBySel("signup-first-name").type(userInfo.firstName);
    cy.getBySel("signup-last-name").type(userInfo.lastName);
    cy.getBySel("signup-username").type(userInfo.username);
    cy.getBySel("signup-password").type(userInfo.password);
    cy.getBySel("signup-confirmPassword").type(userInfo.password);
    cy.visualSnapshot("About to Sign Up");

    // Finally we click the Sign Up button to create our new user account.
    cy.getBySel("signup-submit").click();

    // We will use cy.wait() to wait on our intercept which we aliased to @signup
    // in the beforeEach() hook, to ensure the sign up process has completed until we proceed.
    cy.wait("@signup");

    // Login
    // After creating our user with the sign-in form, we then use cy.login() to log in as our new user.

    // Login User
    cy.login(userInfo.username, userInfo.password);

    // Onboarding
    // After logging in, we see a multi step form that walks the user through creating a bank account
    // as part of the user's onboarding experience.

    // First, we confirm that the onboarding modal is visible and that the loading skeleton is not.
    cy.getBySel("user-onboarding-dialog").should("be.visible");
    cy.getBySel("list-skeleton").should("not.exist");

    // We also confirm that the notification icon exists and then click on the next button.
    cy.getBySel("nav-top-notifications-count").should("exist");
    cy.visualSnapshot("User Onboarding Dialog");
    cy.getBySel("user-onboarding-next").click();

    // On the next screen, we confirm that the modal contains the correct text.
    cy.getBySel("user-onboarding-dialog-title").should("contain", "Create Bank Account");

    // We then fill our the bank account creation form and submit
    cy.getBySelLike("bankName-input").type("The Best Bank");
    cy.getBySelLike("accountNumber-input").type("123456789");
    cy.getBySelLike("routingNumber-input").type("987654321");
    cy.visualSnapshot("About to complete User Onboarding");
    cy.getBySelLike("submit").click();

    // We then wait on our @gqlCreateBankAccountMutation alias to make sure the new bank account
    // has been created before proceeding to the rest of the test.
    cy.wait("@gqlCreateBankAccountMutation");

    // We then confirm we are on the final screen of the onboarding process and click the next button
    // to close the modal.
    cy.getBySel("user-onboarding-dialog-title").should("contain", "Finished");
    cy.getBySel("user-onboarding-dialog-content").should("contain", "You're all set!");
    cy.visualSnapshot("Finished User Onboarding");
    cy.getBySel("user-onboarding-next").click();

    // We then assert that the transaction view is visible, indicating that the onboarding modal
    // has been closed.
    cy.getBySel("transaction-list").should("be.visible");
    cy.visualSnapshot("Transaction List is visible after User Onboarding");

    // Logout
    // Now the only thing left to test is to make sure our users can log out.
    // Once they do, we will write an assertion to ensure they are redirected to the /signin page.

    // Logout User
    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }
    cy.getBySel("sidenav-signout").click();
    cy.location("pathname").should("eq", "/signin");
    cy.visualSnapshot("Redirect to SignIn");

    // The isMobile() is a custom utility function we have written to determine if the viewport
    // is a mobile device or not. You can find out more about how this works here.
    // https://learn.cypress.io/real-world-examples/custom-cypress-commands
  });

  it("should display login errors", function () {
    // An unwritten assertion of this test is to ensure that the application redirects to the
    // sign in page if not logged in
    cy.visit("/");

    // Username
    // Once redirected, we get the username input field, and typing in a user name of User

    // We then .find() the input as the element we are actually selecting is a dive that is
    // wrapping our input.

    // We then clear the input field and trigger a blur event which triggers the validation.
    cy.getBySel("signin-username").type("User").find("input").clear().blur();

    // Next, we confirm that our validation is displaying the correct error message with the following assertion.
    cy.get("#username-helper-text").should("be.visible").and("contain", "Username is required");
    cy.visualSnapshot("Display Username is Required Error");

    // Password
    // We want to test the same behavior for the password input as we dud fir the username input.

    // We make sure our validation fires when the user blurs out of the input
    cy.getBySel("signin-password").type("abc").find("input").blur();

    // Then we will make sure the error message is displayed and has the correct message.
    cy.get("#password-helper-text")
      .should("be.visible")
      .and("contain", "Password must contain at least 4 characters");
    cy.visualSnapshot("Display Password Error");

    // Finally, we want to make sure that our sign in button is disabled. Anytime we have errors on this screen,
    // the user should not be able to click the sign in button.
    cy.getBySel("signin-submit").should("be.disabled");
    cy.visualSnapshot("Sign In Submit Disabled");
  });

  it("should display signup errors", function () {
    cy.intercept("GET", "/signup");

    cy.visit("/signup");

    cy.getBySel("signup-first-name").type("First").find("input").clear().blur();
    cy.get("#firstName-helper-text").should("be.visible").and("contain", "First Name is required");

    cy.getBySel("signup-last-name").type("Last").find("input").clear().blur();
    cy.get("#lastName-helper-text").should("be.visible").and("contain", "Last Name is required");

    cy.getBySel("signup-username").type("User").find("input").clear().blur();
    cy.get("#username-helper-text").should("be.visible").and("contain", "Username is required");

    cy.getBySel("signup-password").type("password").find("input").clear().blur();
    cy.get("#password-helper-text").should("be.visible").and("contain", "Enter your password");

    cy.getBySel("signup-confirmPassword").type("DIFFERENT PASSWORD").find("input").blur();
    cy.get("#confirmPassword-helper-text")
      .should("be.visible")
      .and("contain", "Password does not match");
    cy.visualSnapshot("Display Sign Up Required Errors");

    cy.getBySel("signup-submit").should("be.disabled");
    cy.visualSnapshot("Sign Up Submit Disabled");
  });

  it("should error for an invalid user", function () {
    // First, we are using cy.login(), a Custom Cypress Command to use the Sign In UI to log in
    // as a user with an invalid username and password.
    cy.login("invalidUserName", "invalidPa$$word");

    // Finally, we confirm the error is displayed. The correct error message is shown with
    // a chained expectation that the error is visible and has a specific error message.
    cy.getBySel("signin-error")
      .should("be.visible")
      .and("have.text", "Username or password is invalid");
    cy.visualSnapshot("Sign In, Invalid Username and Password, Username or Password is Invalid");
  });

  it("should error for an invalid password for existing user", function () {
    cy.database("find", "users").then((user: User) => {
      cy.login(user.username, "INVALID");
    });

    cy.getBySel("signin-error")
      .should("be.visible")
      .and("have.text", "Username or password is invalid");
    cy.visualSnapshot("Sign In, Invalid Username, Username or Password is Invalid");
  });
});
