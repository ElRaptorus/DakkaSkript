#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import {
  collectOrkscriptFiles,
  isOrkscriptSourceFile,
  isTypeScriptOutputFile,
  outputPathForSource,
  replaceOrkExtensionWithTypeScript,
} from './cliPaths.ts';
import { appendInlineSourceMappingUrl, toStandardSourceMap } from './sourceMap.ts';
import { transliterate } from './transliterate.ts';

function die(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArguments(argv: string[]): { inputPath: string; outputPath: string | undefined } {
  let inputPath: string | undefined;
  let outputPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === '--out') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('-')) {
        die("You said --out but didn't say where, ya grot!");
      }
      outputPath = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) {
      die(`Wossat extra gubbinz '${argument}', ya git? I only paint .ork files!`);
    }
    if (inputPath !== undefined) {
      die(`Wossat extra gubbinz '${argument}', ya git? I only paint .ork files!`);
    }
    inputPath = argument;
  }

  if (inputPath === undefined) {
    die("Wot? You didn't give me nuffin to paint, ya grot!");
  }

  return { inputPath, outputPath };
}

function sourcePathForMap(sourceFilePath: string, destinationFilePath: string): string {
  const relativePath = relative(dirname(resolve(destinationFilePath)), resolve(sourceFilePath));
  return relativePath.split('\\').join('/');
}

async function statOrUndefined(path: string) {
  try {
    return await stat(path);
  } catch {
    return undefined;
  }
}

async function paintFileToDisk(sourceFilePath: string, destinationFilePath: string): Promise<void> {
  const originalSource = await readFile(sourceFilePath, 'utf8');
  const { typescript, map } = transliterate(originalSource);
  const standardMap = toStandardSourceMap({
    map,
    generated: typescript,
    originalSource,
    originalPath: sourcePathForMap(sourceFilePath, destinationFilePath),
    generatedFileName: basename(destinationFilePath),
  });
  const painted = appendInlineSourceMappingUrl(typescript, standardMap);
  try {
    await mkdir(dirname(destinationFilePath), { recursive: true });
    await writeFile(destinationFilePath, painted, 'utf8');
  } catch {
    die("Can't write dere, boss — dat's not a file I can paint onto!");
  }
}

function writePaintedStdout(typescript: string): void {
  process.stdout.write(typescript);
  if (!typescript.endsWith('\n')) {
    process.stdout.write('\n');
  }
}

async function paintSingleFile(sourceFilePath: string, outputPath: string | undefined): Promise<void> {
  if (!isOrkscriptSourceFile(sourceFilePath)) {
    die("Dat ain't an .ork file, ya git!");
  }

  if (outputPath === undefined) {
    const originalSource = await readFile(sourceFilePath, 'utf8');
    const { typescript } = transliterate(originalSource);
    writePaintedStdout(typescript);
    return;
  }

  if (isTypeScriptOutputFile(outputPath)) {
    const outputStats = await statOrUndefined(outputPath);
    if (outputStats?.isDirectory()) {
      die("Can't write dere, boss — dat's not a file I can paint onto!");
    }
    await paintFileToDisk(sourceFilePath, outputPath);
    return;
  }

  const outputStats = await statOrUndefined(outputPath);
  if (outputStats?.isFile()) {
    die("Can't write dere, boss — dat's already a file, not a folder!");
  }
  const destinationFilePath = join(
    outputPath,
    replaceOrkExtensionWithTypeScript(basename(sourceFilePath)),
  );
  await paintFileToDisk(sourceFilePath, destinationFilePath);
}

async function paintDirectory(sourceDirectory: string, outputPath: string | undefined): Promise<void> {
  if (outputPath === undefined) {
    die("A whole pile o' files needs --out, ya grot! Where'm I supposed to dump da paint?");
  }
  if (isTypeScriptOutputFile(outputPath)) {
    die("Can't pour a whole folder into one .ts file, ya git!");
  }

  const outputStats = await statOrUndefined(outputPath);
  if (outputStats?.isFile()) {
    die("Can't write dere, boss — dat's already a file, not a folder!");
  }

  const sourceFiles = await collectOrkscriptFiles(sourceDirectory);
  if (sourceFiles.length === 0) {
    process.stderr.write("Didn't find no .ork files to paint, boss.\n");
    return;
  }

  const plannedPaints: Array<{ sourceFilePath: string; destinationFilePath: string }> = [];
  const destinationOwners = new Map<string, string>();
  for (const sourceFilePath of sourceFiles) {
    const destinationFilePath = outputPathForSource(sourceFilePath, sourceDirectory, outputPath);
    const destinationKey = resolve(destinationFilePath);
    const previousSource = destinationOwners.get(destinationKey);
    if (previousSource !== undefined) {
      die(
        `Two .ork files wanna paint onto da same .ts, ya git! '${previousSource}' an' '${sourceFilePath}'`,
      );
    }
    destinationOwners.set(destinationKey, sourceFilePath);
    plannedPaints.push({ sourceFilePath, destinationFilePath });
  }

  for (const { sourceFilePath, destinationFilePath } of plannedPaints) {
    await paintFileToDisk(sourceFilePath, destinationFilePath);
  }
}

async function main(): Promise<void> {
  const { inputPath, outputPath } = parseArguments(process.argv.slice(2));

  const inputStats = await statOrUndefined(inputPath);
  if (inputStats === undefined) {
    die("Dat file ain't there, ya git!");
  }

  if (inputStats.isDirectory()) {
    await paintDirectory(inputPath, outputPath);
    return;
  }

  await paintSingleFile(inputPath, outputPath);
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Da paintin' blew up, ya git! ${detail}\n`);
  process.exit(1);
});
