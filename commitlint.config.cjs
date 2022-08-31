module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-leading-blank': [0, 'never'],
    'footer-leading-blank': [0, 'never'],
  },
};
