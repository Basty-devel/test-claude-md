#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="${HOME}/.claude/plugins/cache/@basty/omnifree/1.0.0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== OmniFree Installer ==="

# 1. Build
echo "[1/4] Building..."
cd "$SCRIPT_DIR"
npm run build 2>/dev/null || { echo "ERROR: build failed"; exit 1; }

# 2. Install to npm globally
echo "[2/4] Installing @basty/omnifree globally..."
npm install -g "@basty/omnifree@latest" 2>/dev/null || npm install -g . 2>/dev/null

# 3. Copy plugin files to Claude plugins cache
echo "[3/4] Registering plugin with Claude Code..."
mkdir -p "$PLUGIN_DIR/skills/use"
cp -r "$SCRIPT_DIR/dist/"* "$PLUGIN_DIR/dist/" 2>/dev/null || true
cp -r "$SCRIPT_DIR/skills/use" "$PLUGIN_DIR/skills/use"
cp "$SCRIPT_DIR/.claude-plugin/plugin.json" "$PLUGIN_DIR/"
cp "$SCRIPT_DIR/README.md" "$PLUGIN_DIR/" 2>/dev/null || true
cp "$SCRIPT_DIR/LICENSE" "$PLUGIN_DIR/" 2>/dev/null || true

# 4. Write installed_plugins entry
INSTALL_JSON="${HOME}/.claude/plugins/installed_plugins.json"
if [ -f "$INSTALL_JSON" ]; then
  if command -v node >/dev/null 2>&1; then
    node -e "
const fs = require('fs');
const p = '$INSTALL_JSON';
const d = JSON.parse(fs.readFileSync(p,'utf8'));
d.plugins['omnifree@basty'] = d.plugins['omnifree@basty'] || [{
  scope: 'user',
  installPath: '$PLUGIN_DIR',
  version: '1.0.0',
  installedAt: new Date().toISOString(),
  lastUpdated: new Date().toISOString()
}];
fs.writeFileSync(p, JSON.stringify(d,null,2));
console.log('Plugin registered in installed_plugins.json');
"
  else
    echo "WARNING: node not found — add 'omnifree@basty' to $INSTALL_JSON manually"
  fi
fi

echo ""
echo "[4/4] Done."
echo "  npm global : @basty/omnifree"
echo "  local      : $PLUGIN_DIR"
echo ""
echo "Next: restart Claude Code, then run:"
echo '  /use "hello"'
