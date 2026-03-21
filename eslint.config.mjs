import nextConfig from 'eslint-config-next';

export default [
  ...nextConfig,
  {
    rules: {
      // eslint-plugin-react v7 (bundled in eslint-config-next 16) has a
      // compatibility issue with ESLint 10's flat config API in this rule.
      // The rule itself isn't relevant for modern React (17+) which doesn't
      // require display names on arrow-function components.
      'react/display-name': 'off',
    },
  },
];
