const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({ testDir: './tests', testMatch: '**/*.spec.cjs', timeout: 30000, workers: 1, reporter: 'list' });
