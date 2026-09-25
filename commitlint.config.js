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
    
    // Body max line length: disabled. Squash merges use the PR description as
    // the body, and markdown bullets there routinely exceed any fixed width
    // (the 6.0.0 follow-up merge failed master CI on exactly this). Headers
    // and footers keep their limits below.
    'body-max-line-length': [0],
    
    // Footer max line length. BREAKING CHANGE footers are one sentence per
    // breaking item and must not wrap (semantic-release reads each line as a
    // note); 6.0's longest was 222 characters, so leave headroom.
    'footer-max-line-length': [2, 'always', 250],
  },
  
  // Help message displayed on validation failure
  helpUrl: 'https://www.conventionalcommits.org/',
};
