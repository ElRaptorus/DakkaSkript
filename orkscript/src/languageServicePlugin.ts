import { posix as posixPath } from 'node:path';
import type typescriptModule from 'typescript';
import dictionaryJson from '../dictionary.json' with { type: 'json' };
import { reversePaint } from './reversePaint.ts';
import {
  generatedPositionFor,
  originalPositionFor,
  originalRangeFor,
  transliterate,
  type SourceMap,
} from './transliterate.ts';

const dictionary: Record<string, string> = dictionaryJson;
const dictionaryTypeKeys = new Set(['Wazza', 'Urty', 'Mob', 'Rokk', 'Teef']);

export type OrkscriptPaintCacheEntry = {
  original: string;
  typescript: string;
  map: SourceMap;
  version: string;
};

export type OrkscriptLanguageServiceHost = typescriptModule.LanguageServiceHost & {
  getOrkscriptPaintCacheEntry(fileName: string): OrkscriptPaintCacheEntry | undefined;
};

function isOrkscriptFileName(fileName: string): boolean {
  return fileName.endsWith('.ork');
}

function advanceLineAndColumn(text: string, line: number, column: number): { line: number; column: number } {
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '\r') {
      line += 1;
      column = 0;
      if (text[index + 1] === '\n') {
        index += 1;
      }
    } else if (character === '\n') {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function offsetToLineAndColumn(text: string, offset: number): { line: number; column: number } {
  return advanceLineAndColumn(text.slice(0, offset), 0, 0);
}

function lineAndColumnToOffset(text: string, line: number, column: number): number {
  let currentLine = 0;
  let index = 0;
  while (currentLine < line && index < text.length) {
    const character = text[index];
    if (character === '\r') {
      index += 1;
      if (text[index] === '\n') {
        index += 1;
      }
      currentLine += 1;
    } else if (character === '\n') {
      index += 1;
      currentLine += 1;
    } else {
      index += 1;
    }
  }
  return Math.min(index + column, text.length);
}

function paintedOffsetForOriginalLineAndColumn(painted: string, line: number, column: number): number {
  let currentLine = 0;
  let index = 0;
  while (currentLine < line && index < painted.length) {
    const character = painted[index];
    if (character === '\r') {
      index += 1;
      if (painted[index] === '\n') {
        index += 1;
      }
      currentLine += 1;
    } else if (character === '\n') {
      index += 1;
      currentLine += 1;
    } else {
      index += 1;
    }
  }
  const lineStart = index;
  while (index < painted.length && painted[index] !== '\n' && painted[index] !== '\r') {
    index += 1;
  }
  return lineStart + Math.min(Math.max(column, 0), index - lineStart);
}

function mapGeneratedSpanToSnapshotLine(
  entry: OrkscriptPaintCacheEntry,
  start: number,
  length: number,
): { start: number; length: number } {
  const startPosition = offsetToLineAndColumn(entry.typescript, start);
  const originalStart = originalPositionFor(entry.map, startPosition.line, startPosition.column);
  const mappedStart = paintedOffsetForOriginalLineAndColumn(
    entry.typescript,
    originalStart.line,
    originalStart.column,
  );
  if (length <= 0) {
    return { start: mappedStart, length: 0 };
  }
  const endPosition = offsetToLineAndColumn(entry.typescript, start + length);
  const originalEnd = originalPositionFor(entry.map, endPosition.line, endPosition.column);
  const mappedEnd = paintedOffsetForOriginalLineAndColumn(entry.typescript, originalEnd.line, originalEnd.column);
  return { start: mappedStart, length: Math.max(mappedEnd - mappedStart, 0) };
}

function mapOriginalOffsetToGenerated(entry: OrkscriptPaintCacheEntry, originalOffset: number): number {
  const position = offsetToLineAndColumn(entry.original, originalOffset);
  const generated = generatedPositionFor(entry.map, position.line, position.column);
  return lineAndColumnToOffset(entry.typescript, generated.line, generated.column);
}

function mapGeneratedSpanToOriginal(
  entry: OrkscriptPaintCacheEntry,
  start: number,
  length: number,
): { start: number; length: number } {
  const position = offsetToLineAndColumn(entry.typescript, start);
  const range = originalRangeFor(entry.map, position.line, position.column, length);
  return { start: lineAndColumnToOffset(entry.original, range.line, range.column), length: range.length };
}

function mapOriginalSpanToGenerated(
  entry: OrkscriptPaintCacheEntry,
  start: number,
  length: number,
): { start: number; length: number } {
  const generatedStart = mapOriginalOffsetToGenerated(entry, start);
  const generatedEnd = mapOriginalOffsetToGenerated(entry, start + length);
  return { start: generatedStart, length: Math.max(generatedEnd - generatedStart, 0) };
}

function resolveOrkscriptModuleSpecifier(
  specifier: string,
  containingFile: string,
  knownFileNames: ReadonlySet<string>,
): string | undefined {
  if (!specifier.endsWith('.ork')) {
    return undefined;
  }
  const combined = posixPath.normalize(posixPath.join(posixPath.dirname(containingFile), specifier));
  if (knownFileNames.has(combined)) {
    return combined;
  }
  const base = posixPath.basename(combined);
  return knownFileNames.has(base) ? base : undefined;
}

export function patchLanguageServiceHost(
  host: typescriptModule.LanguageServiceHost,
  ts: typeof typescriptModule,
): typescriptModule.LanguageServiceHost {
  const cache = new Map<string, OrkscriptPaintCacheEntry>();
  const originalGetScriptSnapshot = host.getScriptSnapshot?.bind(host);
  const originalReadFile = host.readFile?.bind(host);
  const originalGetScriptKind = host.getScriptKind?.bind(host);
  const originalGetCompilationSettings = host.getCompilationSettings?.bind(host);
  const originalResolveModuleNameLiterals = host.resolveModuleNameLiterals?.bind(host);
  const originalResolveModuleNames = host.resolveModuleNames?.bind(host);
  // tsserver drops any previously resolved name that is missing from the next
  // call, then asserts that deferred watches still have a file set. One call
  // per specifier trips that assert and kills the language service.
  let compilationSettingsSource: typescriptModule.CompilerOptions | undefined;
  let compilationSettings: typescriptModule.CompilerOptions | undefined;

  function paintedEntryFor(fileName: string, originalText: string): OrkscriptPaintCacheEntry {
    const version = host.getScriptVersion(fileName);
    const cached = cache.get(fileName);
    if (cached !== undefined && cached.version === version && cached.original === originalText) {
      return cached;
    }
    const { typescript: paintedTypescript, map } = transliterate(originalText);
    const entry: OrkscriptPaintCacheEntry = { original: originalText, typescript: paintedTypescript, map, version };
    cache.set(fileName, entry);
    return entry;
  }

  const overrides: Pick<
    OrkscriptLanguageServiceHost,
    | 'getScriptKind'
    | 'getCompilationSettings'
    | 'getScriptSnapshot'
    | 'readFile'
    | 'resolveModuleNameLiterals'
    | 'resolveModuleNames'
    | 'getOrkscriptPaintCacheEntry'
  > = {
    getScriptKind(fileName) {
      if (isOrkscriptFileName(fileName)) {
        return ts.ScriptKind.TS;
      }
      return originalGetScriptKind?.(fileName) ?? ts.ScriptKind.Unknown;
    },
    getCompilationSettings() {
      const current = originalGetCompilationSettings?.() ?? {};
      if (compilationSettings !== undefined && compilationSettingsSource === current) {
        return compilationSettings;
      }
      compilationSettingsSource = current;
      compilationSettings = current.allowNonTsExtensions ? current : { ...current, allowNonTsExtensions: true };
      return compilationSettings;
    },
    getScriptSnapshot(fileName) {
      const snapshot = originalGetScriptSnapshot?.(fileName);
      if (snapshot === undefined || !isOrkscriptFileName(fileName)) {
        return snapshot;
      }
      const originalText = snapshot.getText(0, snapshot.getLength());
      return ts.ScriptSnapshot.fromString(paintedEntryFor(fileName, originalText).typescript);
    },
    readFile(fileName, encoding) {
      const text = originalReadFile?.(fileName, encoding);
      if (text === undefined || !isOrkscriptFileName(fileName)) {
        return text;
      }
      return paintedEntryFor(fileName, text).typescript;
    },
    resolveModuleNameLiterals(
      moduleLiterals,
      containingFile,
      redirectedReference,
      options,
      containingSourceFile,
      reusedNames,
    ) {
      const knownFileNames = new Set(host.getScriptFileNames());
      const resolvedByHost =
        originalResolveModuleNameLiterals === undefined
          ? undefined
          : originalResolveModuleNameLiterals(
              moduleLiterals,
              containingFile,
              redirectedReference,
              options,
              containingSourceFile,
              reusedNames ?? [],
            );
      return moduleLiterals.map((literal, index) => {
        const resolvedFileName = resolveOrkscriptModuleSpecifier(literal.text, containingFile, knownFileNames);
        if (resolvedFileName !== undefined) {
          return {
            resolvedModule: {
              resolvedFileName,
              extension: ts.Extension.Ts,
              isExternalLibraryImport: false,
            },
          };
        }
        if (resolvedByHost !== undefined) {
          return resolvedByHost[index] ?? { resolvedModule: undefined };
        }
        return ts.resolveModuleName(literal.text, containingFile, options, host, undefined, redirectedReference);
      });
    },
    resolveModuleNames(moduleNames, containingFile, reusedNames, redirectedReference, options, containingSourceFile) {
      const knownFileNames = new Set(host.getScriptFileNames());
      const resolvedByHost =
        originalResolveModuleNames === undefined
          ? undefined
          : originalResolveModuleNames(
              moduleNames,
              containingFile,
              reusedNames,
              redirectedReference,
              options,
              containingSourceFile,
            );
      return moduleNames.map((moduleName, index) => {
        const resolvedFileName = resolveOrkscriptModuleSpecifier(moduleName, containingFile, knownFileNames);
        if (resolvedFileName !== undefined) {
          return { resolvedFileName, extension: ts.Extension.Ts, isExternalLibraryImport: false };
        }
        if (resolvedByHost !== undefined) {
          return resolvedByHost[index];
        }
        return ts.resolveModuleName(moduleName, containingFile, options, host, undefined, redirectedReference)
          .resolvedModule;
      });
    },
    getOrkscriptPaintCacheEntry(fileName) {
      return cache.get(fileName);
    },
  };

  Object.assign(host, overrides);
  return host;
}

function paintCacheEntryFor(
  host: typescriptModule.LanguageServiceHost,
  fileName: string,
): OrkscriptPaintCacheEntry | undefined {
  if (!isOrkscriptFileName(fileName)) {
    return undefined;
  }
  const orkscriptHost = host as Partial<OrkscriptLanguageServiceHost>;
  const cached = orkscriptHost.getOrkscriptPaintCacheEntry?.(fileName);
  if (cached !== undefined) {
    return cached;
  }
  host.getScriptSnapshot(fileName);
  return orkscriptHost.getOrkscriptPaintCacheEntry?.(fileName);
}

function identifierPrefixBefore(text: string, offset: number): string {
  let start = offset;
  while (start > 0 && /[$\w]/.test(text[start - 1] ?? '')) {
    start -= 1;
  }
  return text.slice(start, offset);
}

function reversePaintDisplayParts(
  parts: typescriptModule.SymbolDisplayPart[] | undefined,
): typescriptModule.SymbolDisplayPart[] | undefined {
  return parts?.map((part) => ({ ...part, text: reversePaint(part.text) }));
}

function reversePaintDiagnosticMessage(
  messageText: string | typescriptModule.DiagnosticMessageChain,
): string | typescriptModule.DiagnosticMessageChain {
  if (typeof messageText === 'string') {
    return reversePaint(messageText);
  }
  return {
    ...messageText,
    messageText: reversePaint(messageText.messageText),
    next: messageText.next?.map(
      (chain) => reversePaintDiagnosticMessage(chain) as typescriptModule.DiagnosticMessageChain,
    ),
  };
}

export function decorateLanguageService(
  languageService: typescriptModule.LanguageService,
  host: typescriptModule.LanguageServiceHost,
  ts: typeof typescriptModule,
): typescriptModule.LanguageService {
  function entryFor(fileName: string): OrkscriptPaintCacheEntry | undefined {
    return paintCacheEntryFor(host, fileName);
  }

  function toGeneratedPosition(fileName: string, position: number): number {
    const entry = entryFor(fileName);
    return entry === undefined ? position : mapOriginalOffsetToGenerated(entry, position);
  }

  function toGeneratedPositionOrRange(
    fileName: string,
    positionOrRange: number | typescriptModule.TextRange,
  ): number | typescriptModule.TextRange {
    if (typeof positionOrRange === 'number') {
      return toGeneratedPosition(fileName, positionOrRange);
    }
    return {
      pos: toGeneratedPosition(fileName, positionOrRange.pos),
      end: toGeneratedPosition(fileName, positionOrRange.end),
    };
  }

  function mapDocumentSpan<T extends { fileName: string; textSpan: typescriptModule.TextSpan }>(documentSpan: T): T {
    const entry = entryFor(documentSpan.fileName);
    if (entry === undefined) {
      return documentSpan;
    }
    const mapped = mapGeneratedSpanToOriginal(entry, documentSpan.textSpan.start, documentSpan.textSpan.length);
    return { ...documentSpan, textSpan: { start: mapped.start, length: mapped.length } };
  }

  function mapDefinitionDocumentSpan<
    T extends { fileName: string; textSpan: typescriptModule.TextSpan; contextSpan?: typescriptModule.TextSpan },
  >(documentSpan: T): T {
    const entry = entryFor(documentSpan.fileName);
    if (entry === undefined) {
      return documentSpan;
    }
    const textSpan = mapGeneratedSpanToSnapshotLine(entry, documentSpan.textSpan.start, documentSpan.textSpan.length);
    if (documentSpan.contextSpan === undefined) {
      return { ...documentSpan, textSpan };
    }
    const contextSpan = mapGeneratedSpanToSnapshotLine(
      entry,
      documentSpan.contextSpan.start,
      documentSpan.contextSpan.length,
    );
    return { ...documentSpan, textSpan, contextSpan };
  }

  function mapEncodedClassifications(
    entry: OrkscriptPaintCacheEntry,
    classifications: typescriptModule.Classifications,
  ): typescriptModule.Classifications {
    const mappedSpans: number[] = [];
    for (let index = 0; index + 2 < classifications.spans.length; index += 3) {
      const start = classifications.spans[index];
      const length = classifications.spans[index + 1];
      const classification = classifications.spans[index + 2];
      if (start === undefined || length === undefined || classification === undefined) {
        continue;
      }
      const mapped = mapGeneratedSpanToOriginal(entry, start, length);
      mappedSpans.push(mapped.start, mapped.length, classification);
    }
    return { ...classifications, spans: mappedSpans };
  }

  function mapSpanInFile(
    fileName: string,
    span: typescriptModule.TextSpan,
  ): typescriptModule.TextSpan {
    const entry = entryFor(fileName);
    if (entry === undefined) {
      return span;
    }
    const mapped = mapGeneratedSpanToOriginal(entry, span.start, span.length);
    return { start: mapped.start, length: mapped.length };
  }

  function mapTextChange(entry: OrkscriptPaintCacheEntry, textChange: typescriptModule.TextChange): typescriptModule.TextChange {
    const mapped = mapGeneratedSpanToOriginal(entry, textChange.span.start, textChange.span.length);
    return { span: { start: mapped.start, length: mapped.length }, newText: reversePaint(textChange.newText) };
  }

  function mapFileTextChanges(fileTextChanges: typescriptModule.FileTextChanges): typescriptModule.FileTextChanges {
    const entry = entryFor(fileTextChanges.fileName);
    if (entry === undefined) {
      return fileTextChanges;
    }
    return {
      ...fileTextChanges,
      textChanges: fileTextChanges.textChanges.map((textChange) => mapTextChange(entry, textChange)),
    };
  }

  function reversePaintDiagnostic<
    T extends { start?: number; length?: number; messageText: string | typescriptModule.DiagnosticMessageChain },
  >(entry: OrkscriptPaintCacheEntry, diagnostic: T): T {
    const messageText = reversePaintDiagnosticMessage(diagnostic.messageText);
    if (diagnostic.start === undefined || diagnostic.length === undefined) {
      return { ...diagnostic, messageText };
    }
    const mapped = mapGeneratedSpanToOriginal(entry, diagnostic.start, diagnostic.length);
    return { ...diagnostic, start: mapped.start, length: mapped.length, messageText };
  }

  function dictionaryCompletionEntries(prefix: string): typescriptModule.CompletionEntry[] {
    const entries: typescriptModule.CompletionEntry[] = [];
    for (const orkWord of Object.keys(dictionary)) {
      if (!orkWord.startsWith(prefix)) {
        continue;
      }
      entries.push({
        name: orkWord,
        kind: dictionaryTypeKeys.has(orkWord) ? ts.ScriptElementKind.typeElement : ts.ScriptElementKind.keyword,
        kindModifiers: '',
        sortText: '0',
        insertText: orkWord,
      });
    }
    return entries;
  }

  function dedupeByInsertText(entries: typescriptModule.CompletionEntry[]): typescriptModule.CompletionEntry[] {
    const seen = new Set<string>();
    const deduped: typescriptModule.CompletionEntry[] = [];
    for (const entry of entries) {
      const key = entry.insertText ?? entry.name;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(entry);
    }
    return deduped;
  }

  const overrides: Record<string, (...args: never[]) => unknown> = {
    getCompletionsAtPosition(
      fileName: string,
      position: number,
      options: typescriptModule.GetCompletionsAtPositionOptions | undefined,
      formattingSettings?: typescriptModule.FormatCodeSettings,
    ) {
      const entry = entryFor(fileName);
      if (entry === undefined) {
        return languageService.getCompletionsAtPosition(fileName, position, options, formattingSettings);
      }
      const generatedPosition = mapOriginalOffsetToGenerated(entry, position);
      const info = languageService.getCompletionsAtPosition(fileName, generatedPosition, options, formattingSettings);
      const prefix = identifierPrefixBefore(entry.original, position);
      const paintedEntries = (info?.entries ?? []).map((completionEntry) => ({
        ...completionEntry,
        name: reversePaint(completionEntry.name),
        insertText:
          completionEntry.insertText === undefined ? undefined : reversePaint(completionEntry.insertText),
        filterText:
          completionEntry.filterText === undefined ? undefined : reversePaint(completionEntry.filterText),
      }));
      const filteredEntries =
        prefix.length === 0
          ? paintedEntries
          : paintedEntries.filter((completionEntry) =>
              (completionEntry.insertText ?? completionEntry.name).startsWith(prefix),
            );
      const merged = dedupeByInsertText([...filteredEntries, ...dictionaryCompletionEntries(prefix)]);
      const result: typescriptModule.WithMetadata<typescriptModule.CompletionInfo> = {
        isGlobalCompletion: info?.isGlobalCompletion ?? false,
        isMemberCompletion: info?.isMemberCompletion ?? false,
        isNewIdentifierLocation: info?.isNewIdentifierLocation ?? false,
        entries: merged,
      };
      return result;
    },

    getCompletionEntryDetails(
      fileName: string,
      position: number,
      entryName: string,
      formatOptions: typescriptModule.FormatCodeOptions | typescriptModule.FormatCodeSettings | undefined,
      source: string | undefined,
      preferences: typescriptModule.UserPreferences | undefined,
      data: typescriptModule.CompletionEntryData | undefined,
    ) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const generatedEntryName = dictionary[entryName] ?? entryName;
      const details = languageService.getCompletionEntryDetails(
        fileName,
        generatedPosition,
        generatedEntryName,
        formatOptions,
        source,
        preferences,
        data,
      );
      if (details === undefined) {
        return undefined;
      }
      return {
        ...details,
        displayParts: reversePaintDisplayParts(details.displayParts) ?? details.displayParts,
        documentation: reversePaintDisplayParts(details.documentation) ?? details.documentation,
        codeActions: details.codeActions?.map((action) => ({
          ...action,
          description: reversePaint(action.description),
          changes: action.changes.map((change) => mapFileTextChanges(change)),
        })),
      };
    },

    getQuickInfoAtPosition(fileName: string, position: number, maximumLength?: number) {
      const entry = entryFor(fileName);
      if (entry === undefined) {
        return languageService.getQuickInfoAtPosition(fileName, position, maximumLength);
      }
      const generatedPosition = mapOriginalOffsetToGenerated(entry, position);
      const quickInfo = languageService.getQuickInfoAtPosition(fileName, generatedPosition, maximumLength);
      if (quickInfo === undefined) {
        return undefined;
      }
      const mappedSpan = mapGeneratedSpanToOriginal(entry, quickInfo.textSpan.start, quickInfo.textSpan.length);
      return {
        ...quickInfo,
        textSpan: { start: mappedSpan.start, length: mappedSpan.length },
        displayParts: reversePaintDisplayParts(quickInfo.displayParts),
        documentation: reversePaintDisplayParts(quickInfo.documentation),
      };
    },

    getSyntacticDiagnostics(fileName: string) {
      const entry = entryFor(fileName);
      const diagnostics = languageService.getSyntacticDiagnostics(fileName);
      return entry === undefined
        ? diagnostics
        : diagnostics.map((diagnostic) => reversePaintDiagnostic(entry, diagnostic));
    },

    getSemanticDiagnostics(fileName: string) {
      const entry = entryFor(fileName);
      const diagnostics = languageService.getSemanticDiagnostics(fileName);
      return entry === undefined
        ? diagnostics
        : diagnostics.map((diagnostic) => reversePaintDiagnostic(entry, diagnostic));
    },

    getSuggestionDiagnostics(fileName: string) {
      const entry = entryFor(fileName);
      const diagnostics = languageService.getSuggestionDiagnostics(fileName);
      return entry === undefined
        ? diagnostics
        : diagnostics.map((diagnostic) => reversePaintDiagnostic(entry, diagnostic));
    },

    getEncodedSemanticClassifications(
      fileName: string,
      span: typescriptModule.TextSpan,
      format?: typescriptModule.SemanticClassificationFormat,
    ) {
      const entry = entryFor(fileName);
      if (entry === undefined) {
        return languageService.getEncodedSemanticClassifications(fileName, span, format);
      }
      const generatedSpan = mapOriginalSpanToGenerated(entry, span.start, span.length);
      return mapEncodedClassifications(
        entry,
        languageService.getEncodedSemanticClassifications(fileName, generatedSpan, format),
      );
    },

    getEncodedSyntacticClassifications(fileName: string, span: typescriptModule.TextSpan) {
      const entry = entryFor(fileName);
      if (entry === undefined) {
        return languageService.getEncodedSyntacticClassifications(fileName, span);
      }
      const generatedSpan = mapOriginalSpanToGenerated(entry, span.start, span.length);
      return mapEncodedClassifications(
        entry,
        languageService.getEncodedSyntacticClassifications(fileName, generatedSpan),
      );
    },

    getDefinitionAtPosition(fileName: string, position: number) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const definitions = languageService.getDefinitionAtPosition(fileName, generatedPosition);
      return definitions?.map((definition) => mapDefinitionDocumentSpan(definition));
    },

    getDefinitionAndBoundSpan(fileName: string, position: number) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const result = languageService.getDefinitionAndBoundSpan(fileName, generatedPosition);
      if (result === undefined) {
        return undefined;
      }
      return {
        definitions: result.definitions?.map((definition) => mapDefinitionDocumentSpan(definition)),
        textSpan: mapSpanInFile(fileName, result.textSpan),
      };
    },

    getTypeDefinitionAtPosition(fileName: string, position: number) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const definitions = languageService.getTypeDefinitionAtPosition(fileName, generatedPosition);
      return definitions?.map((definition) => mapDefinitionDocumentSpan(definition));
    },

    getImplementationAtPosition(fileName: string, position: number) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const implementations = languageService.getImplementationAtPosition(fileName, generatedPosition);
      return implementations?.map((implementation) => mapDefinitionDocumentSpan(implementation));
    },

    getReferencesAtPosition(fileName: string, position: number) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const references = languageService.getReferencesAtPosition(fileName, generatedPosition);
      return references?.map((reference) => mapDocumentSpan(reference));
    },

    findReferences(fileName: string, position: number) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const symbols = languageService.findReferences(fileName, generatedPosition);
      return symbols?.map((symbol) => ({
        ...symbol,
        references: symbol.references.map((reference) => mapDocumentSpan(reference)),
      }));
    },

    getSignatureHelpItems(
      fileName: string,
      position: number,
      options: typescriptModule.SignatureHelpItemsOptions | undefined,
    ) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const items = languageService.getSignatureHelpItems(fileName, generatedPosition, options);
      if (items === undefined) {
        return undefined;
      }
      return {
        ...items,
        applicableSpan: mapSpanInFile(fileName, items.applicableSpan),
        items: items.items.map((item) => ({
          ...item,
          prefixDisplayParts: reversePaintDisplayParts(item.prefixDisplayParts) ?? item.prefixDisplayParts,
          suffixDisplayParts: reversePaintDisplayParts(item.suffixDisplayParts) ?? item.suffixDisplayParts,
          separatorDisplayParts: reversePaintDisplayParts(item.separatorDisplayParts) ?? item.separatorDisplayParts,
          documentation: reversePaintDisplayParts(item.documentation) ?? item.documentation,
          parameters: item.parameters.map((parameter) => ({
            ...parameter,
            displayParts: reversePaintDisplayParts(parameter.displayParts) ?? parameter.displayParts,
            documentation: reversePaintDisplayParts(parameter.documentation) ?? parameter.documentation,
          })),
        })),
      };
    },

    getRenameInfo(
      fileName: string,
      position: number,
      preferencesOrOptions: typescriptModule.UserPreferences | typescriptModule.RenameInfoOptions | undefined,
    ) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const info = languageService.getRenameInfo(fileName, generatedPosition, preferencesOrOptions);
      if (!info.canRename) {
        return info;
      }
      return { ...info, triggerSpan: mapSpanInFile(fileName, info.triggerSpan) };
    },

    findRenameLocations(
      fileName: string,
      position: number,
      findInStrings: boolean,
      findInComments: boolean,
      preferencesOrProvidePrefixAndSuffix: typescriptModule.UserPreferences | boolean | undefined,
    ) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const locations = languageService.findRenameLocations(
        fileName,
        generatedPosition,
        findInStrings,
        findInComments,
        preferencesOrProvidePrefixAndSuffix,
      );
      return locations?.map((location) => mapDocumentSpan(location));
    },

    getCodeFixesAtPosition(
      fileName: string,
      start: number,
      end: number,
      errorCodes: readonly number[],
      formatOptions: typescriptModule.FormatCodeSettings,
      preferences: typescriptModule.UserPreferences,
    ) {
      const entry = entryFor(fileName);
      if (entry === undefined) {
        return languageService.getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions, preferences);
      }
      const generatedStart = mapOriginalOffsetToGenerated(entry, start);
      const generatedEnd = mapOriginalOffsetToGenerated(entry, end);
      const fixes = languageService.getCodeFixesAtPosition(
        fileName,
        generatedStart,
        generatedEnd,
        errorCodes,
        formatOptions,
        preferences,
      );
      return fixes.map((fix) => ({
        ...fix,
        description: reversePaint(fix.description),
        changes: fix.changes.map((change) => mapFileTextChanges(change)),
      }));
    },

    getDocumentHighlights(fileName: string, position: number, filesToSearch: string[]) {
      const generatedPosition = toGeneratedPosition(fileName, position);
      const documentHighlightsList = languageService.getDocumentHighlights(fileName, generatedPosition, filesToSearch);
      return documentHighlightsList?.map((documentHighlights) => ({
        ...documentHighlights,
        highlightSpans: documentHighlights.highlightSpans.map((highlightSpan) => {
          const highlightSpanFileName = highlightSpan.fileName ?? documentHighlights.fileName;
          const mappedHighlightSpan: typescriptModule.HighlightSpan = {
            ...highlightSpan,
            textSpan: mapSpanInFile(highlightSpanFileName, highlightSpan.textSpan),
          };
          if (highlightSpan.contextSpan !== undefined) {
            mappedHighlightSpan.contextSpan = mapSpanInFile(highlightSpanFileName, highlightSpan.contextSpan);
          }
          return mappedHighlightSpan;
        }),
      }));
    },

    getApplicableRefactors(
      fileName: string,
      positionOrRange: number | typescriptModule.TextRange,
      preferences: typescriptModule.UserPreferences | undefined,
      triggerReason?: typescriptModule.RefactorTriggerReason,
      kind?: string,
      includeInteractiveActions?: boolean,
    ) {
      const generatedPositionOrRange = toGeneratedPositionOrRange(fileName, positionOrRange);
      return languageService.getApplicableRefactors(
        fileName,
        generatedPositionOrRange,
        preferences,
        triggerReason,
        kind,
        includeInteractiveActions,
      );
    },

    getEditsForRefactor(
      fileName: string,
      formatOptions: typescriptModule.FormatCodeSettings,
      positionOrRange: number | typescriptModule.TextRange,
      refactorName: string,
      actionName: string,
      preferences: typescriptModule.UserPreferences | undefined,
      interactiveRefactorArguments?: typescriptModule.InteractiveRefactorArguments,
    ) {
      const generatedPositionOrRange = toGeneratedPositionOrRange(fileName, positionOrRange);
      const refactorEditInfo = languageService.getEditsForRefactor(
        fileName,
        formatOptions,
        generatedPositionOrRange,
        refactorName,
        actionName,
        preferences,
        interactiveRefactorArguments,
      );
      if (refactorEditInfo === undefined) {
        return undefined;
      }
      return {
        ...refactorEditInfo,
        edits: refactorEditInfo.edits.map((fileTextChanges) => mapFileTextChanges(fileTextChanges)),
      };
    },

    getCombinedCodeFix(
      scope: typescriptModule.CombinedCodeFixScope,
      fixId: {},
      formatOptions: typescriptModule.FormatCodeSettings,
      preferences: typescriptModule.UserPreferences,
    ) {
      const combinedCodeActions = languageService.getCombinedCodeFix(scope, fixId, formatOptions, preferences);
      return {
        ...combinedCodeActions,
        changes: combinedCodeActions.changes.map((fileTextChanges) => mapFileTextChanges(fileTextChanges)),
      };
    },
  };

  return new Proxy(languageService, {
    get(target, property, receiver) {
      if (typeof property === 'string' && Object.hasOwn(overrides, property)) {
        return overrides[property];
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
