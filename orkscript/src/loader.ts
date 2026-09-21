import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { basename, isAbsolute, resolve as resolveFilePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { appendInlineSourceMappingUrl, toStandardSourceMap } from './sourceMap.ts';
import { transliterate } from './transliterate.ts';

if (isMainThread) {
  register(import.meta.url);
}

type ResolveContext = {
  parentURL?: string;
};

type ResolveResult = {
  url: string;
  format?: string | null;
  shortCircuit?: boolean;
};

type LoadContext = {
  format?: string | null;
};

type LoadResult = {
  format: string;
  source: string;
  shortCircuit?: boolean;
};

function isOrkSpecifier(specifier: string): boolean {
  return specifier.endsWith('.ork');
}

function isOrkUrl(url: string): boolean {
  return url.endsWith('.ork');
}

function resolveOrkUrl(specifier: string, parentURL: string | undefined): string {
  if (specifier.startsWith('file:')) {
    return specifier;
  }
  if (isAbsolute(specifier)) {
    return pathToFileURL(specifier).href;
  }
  if (parentURL !== undefined) {
    return new URL(specifier, parentURL).href;
  }
  return pathToFileURL(resolveFilePath(specifier)).href;
}

export async function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: (specifier: string, context: ResolveContext) => Promise<ResolveResult>,
): Promise<ResolveResult> {
  if (!isOrkSpecifier(specifier)) {
    return nextResolve(specifier, context);
  }
  return {
    url: resolveOrkUrl(specifier, context.parentURL),
    format: 'module',
    shortCircuit: true,
  };
}

export async function load(
  url: string,
  context: LoadContext,
  nextLoad: (url: string, context: LoadContext) => Promise<LoadResult>,
): Promise<LoadResult> {
  if (!isOrkUrl(url)) {
    return nextLoad(url, context);
  }

  const filePath = fileURLToPath(url);
  const originalSource = readFileSync(filePath, 'utf8');
  const { typescript, map } = transliterate(originalSource);
  const standardMap = toStandardSourceMap({
    map,
    generated: typescript,
    originalSource,
    originalPath: filePath,
    generatedFileName: basename(filePath),
  });

  return {
    format: 'module',
    source: appendInlineSourceMappingUrl(typescript, standardMap),
    shortCircuit: true,
  };
}
