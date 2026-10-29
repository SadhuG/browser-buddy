// Live tests against real youtube.com (npm run test:live). Local only, not CI:
// ads, network and consent screens make them slower and flakier than the e2e suite.
module.exports = { testDir: 'tests/live', workers: 1, timeout: 120000, retries: 1, use: { trace: 'retain-on-failure' } };
