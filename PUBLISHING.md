# Publishing to npm

This repository has been configured to publish packages under the `@mcborov01` npm scope.

## Prerequisites

Before publishing, you need to:

1. Log in to npm with your account:
```bash
npm login
```

2. Ensure you are logged in as the correct user:
```bash
npm whoami
```
Should output: `mcborov01`

## Publishing Packages

### Publish All Packages

To publish all workspace packages at once:

```bash
npm run publish-all
```

This will run `npm publish --workspaces --access public` to publish all packages.

### Publish Individual Package

To publish a specific package:

```bash
cd src/memory-enhanced
npm publish --access public
```

## Package Names

All packages have been renamed from `@modelcontextprotocol/*` to `@mcborov01/*`:

- `@mcborov01/server-everything`
- `@mcborov01/server-memory`
- `@mcborov01/server-memory-enhanced`
- `@mcborov01/server-filesystem`
- `@mcborov01/server-sequential-thinking`

## Troubleshooting

### 404 Not Found Error

If you get a 404 error, ensure that:
1. You are logged in with the correct npm account (`npm whoami` should return `mcborov01`)
2. The package name in package.json uses the `@mcborov01` scope
3. You're using the `--access public` flag for scoped packages

### Access Token Issues

If you see "Access token expired or revoked", you need to log in again:
```bash
npm logout
npm login
```

## Building Before Publishing

All packages are automatically built before publishing via the `prepare` script. You can manually build all packages:

```bash
npm run build
```
