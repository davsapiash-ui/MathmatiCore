import 'cypress-axe';

// Add custom command to inject and run axe
Cypress.Commands.add('checkA11yUDL', (context, options) => {
  cy.injectAxe();
  cy.checkA11y(context, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
    },
    ...options
  });
});
