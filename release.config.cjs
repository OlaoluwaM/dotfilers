module.exports = {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { type: 'feat', scope: 'docs', release: 'patch' },
          { type: 'chore', scope: 'docs', release: 'patch' },
          { type: 'feat', scope: 'release-major', release: 'major' },
          { type: 'feat', scope: 'release-minor', release: 'minor' },
          { type: 'feat', scope: 'release-patch', release: 'patch' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { scope: 'no-release', release: false },
        ],
      },
    ],
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    '@semantic-release/npm',
    [
      '@semantic-release/github',
      {
        assets: [{ path: 'bin/build.cjs', label: 'Standalone JS executable' }],
      },
    ],
  ],
};
