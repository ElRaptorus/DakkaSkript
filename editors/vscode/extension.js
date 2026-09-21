const vscode = require('vscode');

async function activate() {
  const typescriptExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
  if (typescriptExtension && !typescriptExtension.isActive) {
    await typescriptExtension.activate();
  }
}

module.exports = { activate };
