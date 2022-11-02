import { User } from "../../../src/models";
import { isMobile } from "../../support/utils";

describe("User Settings", function () {
  beforeEach(function () {
    // The first thing we are doing is seeding our database using a custom Cypress task.
    cy.task("db:seed");

    // Next, we are using cy.intercept() to intercept every PATCH request to the /users/* route.
    // We are then aliasing this intercept to "updateUser". When you see @updateUser being used
    // within a test, it is referring to this intercept.
    cy.intercept("PATCH", "/users/*").as("updateUser");

    // We are also intercepting any GET request to the /notifications route and aliasing
    // the intercept to "getNotifications". When you see @getNotifications being used within a test,
    // it is referring to this intercept.
    cy.intercept("GET", "/notifications*").as("getNotifications");

    // We then use a custom Cypress command cy.database() to query our database for our users.
    // Then we use another custom Cypress command cy.loginByXState() to login into the application
    // using one of the users returned from cy.database().

    // You can find out how these custom Commands work in greater detail here:
    // https://learn.cypress.io/real-world-examples/custom-cypress-commands
    cy.database("find", "users").then((user: User) => {
      cy.loginByXstate(user.username);
    });

    // Finally, we click the button to open the user settings window.
    // We have a special utility function to determine if we are simulating a mobile device or not.
    // You can find out how to isMobile() function works in greater detail here:
    // https://learn.cypress.io/real-world-examples/custom-cypress-commands
    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }

    cy.getBySel("sidenav-user-settings").click();
  });

  it("renders the user settings form", function () {
    cy.wait("@getNotifications");
    cy.getBySel("user-settings-form").should("be.visible");
    cy.location("pathname").should("include", "/user/settings");

    cy.visualSnapshot("User Settings Form");
  });

  it("should display user setting form errors", function () {
    // First & Last Name Inputs
    // First, we are looping through an array of two strings to find the firstName and lastName inputs.
    // Remember, Cypress is just JavaScript, so we can use Array.forEach() to simplify our code
    // and remove duplication.
    ["first", "last"].forEach((field) => {
      // We then instruct Cypress to use .type() to enter "Abc" into each input, clear the input,
      // and trigger the blur event on the input. We then assert that the validation error is triggered
      // and contains the correct error message.
      cy.getBySelLike(`${field}Name-input`).type("Abc").clear().blur();
      cy.get(`#user-settings-${field}Name-input-helper-text`)
        .should("be.visible")
        .and("contain", `Enter a ${field} name`);
    });

    // Email & Phone inputs
    // Let's finish our test by asserting that the email and phone inputs also throwing
    // the correct error messages. The code is virtually identical to the last name
    // and first name code above. The only difference is the selector name.
    cy.getBySelLike("email-input").type("abc").clear().blur();
    cy.get("#user-settings-email-input-helper-text")
      .should("be.visible")
      .and("contain", "Enter an email address");

    cy.getBySelLike("email-input").type("abc@bob.").blur();
    cy.get("#user-settings-email-input-helper-text")
      .should("be.visible")
      .and("contain", "Must contain a valid email address");

    cy.getBySelLike("phoneNumber-input").type("abc").clear().blur();
    cy.get("#user-settings-phoneNumber-input-helper-text")
      .should("be.visible")
      .and("contain", "Enter a phone number");

    // We have two different assertions for both the email and phone number fields since
    // these two fields can show different error messages depending upon the error.
    cy.getBySelLike("phoneNumber-input").type("615-555-").blur();
    cy.get("#user-settings-phoneNumber-input-helper-text")
      .should("be.visible")
      .and("contain", "Phone number is not valid");

    // Finally, we will make sure that the submit button is disabled since there are errors with our form.
    cy.getBySelLike("submit").should("be.disabled");
    cy.visualSnapshot("User Settings Form Errors and Submit Disabled");
  });

  it("updates first name, last name, email and phone number", function () {
    cy.getBySelLike("firstName").clear().type("New First Name");
    cy.getBySelLike("lastName").clear().type("New Last Name");
    cy.getBySelLike("email").clear().type("email@email.com");
    cy.getBySelLike("phoneNumber-input").clear().type("6155551212").blur();

    cy.getBySelLike("submit").should("not.be.disabled");
    cy.getBySelLike("submit").click();

    cy.wait("@updateUser").its("response.statusCode").should("equal", 204);

    if (isMobile()) {
      cy.getBySel("sidenav-toggle").click();
    }

    cy.getBySel("sidenav-user-full-name").should("contain", "New First Name");
    cy.visualSnapshot("User Settings Update Profile");
  });
});
