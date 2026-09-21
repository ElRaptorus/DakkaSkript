import dictionaryJson from '../dictionary.json' with { type: 'json' };
import { lex } from './lex.ts';
import { shouldRewrite } from './transliterate.ts';

const dictionary: Record<string, string> = dictionaryJson;

function buildReverseDictionary(table: Record<string, string>): Record<string, string> {
  const reversed: Record<string, string> = {};
  for (const [orkWord, englishWord] of Object.entries(table)) {
    if (Object.hasOwn(reversed, englishWord)) {
      throw new Error(
        `Dictionary values must be unique: "${englishWord}" maps back to both "${reversed[englishWord]}" and "${orkWord}"`,
      );
    }
    reversed[englishWord] = orkWord;
  }
  return reversed;
}

export const reverseDictionary: Record<string, string> = buildReverseDictionary(dictionary);

export function reverseTransliterate(source: string): string {
  const tokens = lex(source);
  let output = '';

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    if (token === undefined) {
      continue;
    }
    if (shouldRewrite(tokens, tokenIndex, reverseDictionary)) {
      output += reverseDictionary[token.value];
    } else {
      output += token.value;
    }
  }

  return output;
}

export function reversePaint(source: string): string {
  return reverseTransliterate(source);
}
