import { readdir, realpath, stat } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

const SKIP_DIRECTORY_NAMES = new Set(['node_modules', '.git']);

function hasTrailingSlash(outputPath: string): boolean {
  return outputPath.endsWith('/') || outputPath.endsWith('\\');
}

export function isOrkscriptSourceFile(filePath: string): boolean {
  return /\.ork$/i.test(basename(filePath));
}

export function isTypeScriptOutputFile(outputPath: string): boolean {
  if (hasTrailingSlash(outputPath)) {
    return false;
  }
  return /\.ts$/i.test(basename(outputPath));
}

export function replaceOrkExtensionWithTypeScript(filePath: string): string {
  return filePath.replace(/\.ork$/i, '.ts');
}

export function outputPathForSource(sourceFilePath: string, sourceRoot: string, outputDirectory: string): string {
  const relativeSource = relative(sourceRoot, sourceFilePath);
  const relativeTypeScript = replaceOrkExtensionWithTypeScript(relativeSource);
  return join(outputDirectory, relativeTypeScript);
}

export async function collectOrkscriptFiles(rootDirectory: string): Promise<string[]> {
  const collected: string[] = [];
  const visitedRealPaths = new Set<string>();
  await walkDirectory(rootDirectory, collected, visitedRealPaths);
  collected.sort((left, right) => left.localeCompare(right));
  return collected;
}

async function walkDirectory(
  directoryPath: string,
  collected: string[],
  visitedRealPaths: Set<string>,
): Promise<void> {
  let directoryRealPath: string;
  try {
    directoryRealPath = await realpath(directoryPath);
  } catch {
    return;
  }
  if (visitedRealPaths.has(directoryRealPath)) {
    return;
  }
  visitedRealPaths.add(directoryRealPath);

  const entries = await readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRECTORY_NAMES.has(entry.name)) {
      continue;
    }
    const entryPath = join(directoryPath, entry.name);
    let entryStats;
    try {
      entryStats = await stat(entryPath);
    } catch {
      continue;
    }
    if (entryStats.isDirectory()) {
      await walkDirectory(entryPath, collected, visitedRealPaths);
      continue;
    }
    if (entryStats.isFile() && isOrkscriptSourceFile(entryPath)) {
      collected.push(entryPath);
    }
  }
}
