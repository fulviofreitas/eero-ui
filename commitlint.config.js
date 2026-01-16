/**
 * Commitlint Configuration
 * 
 * Enforces Conventional Commits specification for semantic versioning.
 * @see https://www.conventionalcommits.org/
 * @see https://github.com/conventional-changelog/commitlint
 */

export default {
  extends: ['@commitlint/config-conventional'],
  
  rules: {
    // Type must be one of the following
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature (minor version bump)
        'fix',      // Bug fix (patch version bump)
        'perf',     // Performance improvement (patch version bump)
        'refactor', // Code refactoring (patch version bump)
        'docs',     // Documentation only
        'style',    // Code style (formatting, semicolons, etc.)
        'test',     // Adding or updating tests
        'chore',    // Maintenance tasks
        'ci',       // CI/CD changes
        'build',    // Build system changes
        'revert',   // Reverting a previous commit
      ],
    ],
    
    // Type must be lowercase
    'type-case': [2, 'always', 'lower-case'],
    
    // Type cannot be empty
    'type-empty': [2, 'never'],
    
    // Subject cannot be empty
    'subject-empty': [2, 'never'],
    
    // Subject case: disabled to allow acronyms (CI/CD, API, HTTP, etc.)
    // Conventional commits don't strictly require lowercase subjects
    'subject-case': [0],
    
    // Subject must not end with period
    'subject-full-stop': [2, 'never', '.'],
    
    // Header (type + scope + subject) max length
    'header-max-length': [2, 'always', 100],
    
    // Body max line length
    'body-max-line-length': [2, 'always', 200],
    
    // Footer max line length
    'footer-max-line-length': [2, 'always', 200],
  },
  
  // Help message displayed on validation failure
  helpUrl: 'https://www.conventionalcommits.org/',
};
