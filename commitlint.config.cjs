module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-case': [0, 'never'],
    'body-leading-blank': [0, 'never'],
    'body-empty': [0, 'never'],
    'subject-case': [1, 'always', 'sentence-case'],
    'footer-leading-blank': [0, 'never'],
  },
};
