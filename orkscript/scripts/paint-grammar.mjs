#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZedHighlights } from './paint-zed-highlights.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDirectory, '../..');
const dictionaryPath = join(repoRoot, 'orkscript/dictionary.json');
const vendorGrammarPath = join(repoRoot, 'editors/vscode/vendor/TypeScript.tmLanguage.json');
const outputGrammarPath = join(repoRoot, 'editors/vscode/syntaxes/orkscript.tmLanguage.json');

const WORD_BOUNDARY_ESCAPES = new Set(['\\b', '\\B']);

const MISSING_SUPPORT_CLASS_ENGLISH = ['Error', 'Array', 'Object', 'Record'];

const SUPPORT_CLASS_MATCH_PREFIX = '(?<![_$[:alnum:]])(?:(?<=\\.\\.\\.)|(?<!\\.))(';
const SUPPORT_CLASS_MATCH_SUFFIX = ')\\b(?!\\$)';

function isRegexIdentifierBoundary(source, start, end) {
  if (start > 0) {
    const previousTwo = start >= 2 ? source.slice(start - 2, start) : '';
    if (!WORD_BOUNDARY_ESCAPES.has(previousTwo)) {
      const previous = source[start - 1];
      if (/[A-Za-z0-9_]/.test(previous)) {
        return false;
      }
    }
  }
  if (end < source.length) {
    const nextTwo = source.slice(end, end + 2);
    if (!WORD_BOUNDARY_ESCAPES.has(nextTwo)) {
      const next = source[end];
      if (/[A-Za-z0-9_]/.test(next)) {
        return false;
      }
    }
  }
  return true;
}

function findIdentifierOccurrences(source, word) {
  const occurrences = [];
  let searchFrom = 0;
  while (searchFrom <= source.length - word.length) {
    const index = source.indexOf(word, searchFrom);
    if (index === -1) {
      break;
    }
    const end = index + word.length;
    if (isRegexIdentifierBoundary(source, index, end)) {
      occurrences.push({ index, end });
    }
    searchFrom = index + 1;
  }
  return occurrences;
}

function paintEnglishWord(source, english, ork) {
  const alreadyPainted = `|${ork}`;
  const occurrences = findIdentifierOccurrences(source, english);
  let result = source;
  for (let occurrenceIndex = occurrences.length - 1; occurrenceIndex >= 0; occurrenceIndex -= 1) {
    const { index, end } = occurrences[occurrenceIndex];
    if (result.startsWith(alreadyPainted, end)) {
      continue;
    }
    const before = index > 0 ? result[index - 1] : '';
    const after = end < result.length ? result[end] : '';
    const inAlternation = before === '|' || after === '|';
    const soleCapture = before === '(' && after === ')';
    if (inAlternation || soleCapture) {
      result = `${result.slice(0, end)}${alreadyPainted}${result.slice(end)}`;
    } else {
      result = `${result.slice(0, index)}(?:${english}|${ork})${result.slice(end)}`;
    }
  }
  return result;
}

function paintString(source, dictionary) {
  let painted = source;
  for (const [orkWord, englishWord] of Object.entries(dictionary)) {
    painted = paintEnglishWord(painted, englishWord, orkWord);
  }
  return painted;
}

function paintGrammarNode(node, dictionary) {
  if (Array.isArray(node)) {
    for (const child of node) {
      paintGrammarNode(child, dictionary);
    }
    return;
  }
  if (node === null || typeof node !== 'object') {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if ((key === 'match' || key === 'begin' || key === 'end') && typeof value === 'string') {
      node[key] = paintString(value, dictionary);
    } else {
      paintGrammarNode(value, dictionary);
    }
  }
}

function injectMissingSupportClassPatterns(grammar) {
  const supportObjects = grammar.repository?.['support-objects'];
  if (!supportObjects || !Array.isArray(supportObjects.patterns)) {
    throw new Error('Vendored grammar is missing repository.support-objects.patterns');
  }
  const promiseIndex = supportObjects.patterns.findIndex(
    (pattern) => pattern?.name === 'support.class.promise.ts',
  );
  if (promiseIndex === -1) {
    throw new Error('Vendored grammar is missing support.class.promise.ts');
  }
  const existingMatches = supportObjects.patterns
    .map((pattern) => pattern.match)
    .filter((match) => typeof match === 'string');
  const insertions = [];
  for (const englishWord of MISSING_SUPPORT_CLASS_ENGLISH) {
    const alreadyPresent = existingMatches.some((match) => {
      const index = match.indexOf(englishWord);
      return index !== -1 && isRegexIdentifierBoundary(match, index, index + englishWord.length);
    });
    if (alreadyPresent) {
      continue;
    }
    insertions.push({
      name: 'support.class.ts',
      match: `${SUPPORT_CLASS_MATCH_PREFIX}${englishWord}${SUPPORT_CLASS_MATCH_SUFFIX}`,
    });
  }
  if (insertions.length > 0) {
    supportObjects.patterns.splice(promiseIndex + 1, 0, ...insertions);
  }
}

function stringifyGrammar(grammar) {
  return `${JSON.stringify(grammar, null, 2)}\n`;
}

const dictionary = JSON.parse(readFileSync(dictionaryPath, 'utf8'));
const grammar = JSON.parse(readFileSync(vendorGrammarPath, 'utf8'));

grammar.information_for_contributors = [
  'Generated by orkscript/scripts/paint-grammar.mjs. Do not edit by hand.',
  'Vendored TypeScript grammar: editors/vscode/vendor/TypeScript.tmLanguage.json',
  'Pin: microsoft/vscode@210541906e5a96ab39f9c753f921b1bd35f4138b (TypeScript-TmLanguage@48f608692aa6d6ad7bd65b478187906c798234a8)',
];
grammar.name = 'Orkscript';
grammar.scopeName = 'source.orkscript';
grammar.fileTypes = ['ork'];

injectMissingSupportClassPatterns(grammar);
paintGrammarNode(grammar, dictionary);

mkdirSync(dirname(outputGrammarPath), { recursive: true });
writeFileSync(outputGrammarPath, stringifyGrammar(grammar));
writeZedHighlights(repoRoot, dictionary);
