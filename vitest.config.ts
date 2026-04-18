import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['**/dist/**', '**/tests/**', '**/*.config.*'],
    },
    reporters: process.env['CI'] ? ['default', 'github-actions'] : ['default'],
  },
});
