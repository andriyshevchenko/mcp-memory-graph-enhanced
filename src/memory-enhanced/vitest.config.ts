import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['**/*.ts'],
      exclude: [
        '**/__tests__/**',
        '**/dist/**',
        '**/vitest.config.ts',
        '**/lib/types.ts',
        '**/lib/storage-interface.ts',
        // Exclude index.ts from coverage because the main MCP server initialization
        // and tool registration logic cannot be easily tested in isolation.
        // Utility functions from this file (e.g., ensureMemoryDirectory) are covered
        // separately in index.test.ts.
        '**/index.ts'
      ],
    },
  },
});
