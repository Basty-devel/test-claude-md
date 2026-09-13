# Install Script — OmniFree (/use)

## Step 1: Validate

```bash
claude plugin validate .
```

## Step 2: Build + Publish to npm

```bash
npm run build
npm publish --access public
```

Verify: https://www.npmjs.com/package/@basty/omnifree

## Step 3: Register with Claude Code

Inside a Claude Code session:

```
/plugin add @basty/omnifree
# or
/plugin marketplace add github.com/Basty-devel/test-claude-md
```

## Step 4: Verify

In Claude Code:

```
/use "hello"
```

Expected: chat provider routes the prompt.

## Step 5: Troubleshooting

| Error | Fix |
|---|---|
| `Unknown command: /use` | Plugin not in `installed_plugins.json` — use `/plugin add` |
| `403 Forbidden` (npm) | Check `npm token list --json` scope includes `@basty`; ensure `bypass_2fa: true` |
| `type: commonjs` breakage | Package must be `type: module` with ESM output |
| `can not read package.json` | Running `prebuild-install` in wrong cwd — use `npm approve-scripts` instead |