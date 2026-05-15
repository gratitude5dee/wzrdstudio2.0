import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_DIRECTOR_CUT_ENV_FILES = ['.env.example', '.env', '.env.local'];

const parseQuotedValue = (value, quote) => {
  const endIndex = value.indexOf(quote, 1);
  if (endIndex === -1) return value.slice(1);
  const inner = value.slice(1, endIndex);
  if (quote === "'") return inner;
  return inner
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
};

export const parseEnvFile = (text) => {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.trimStart();
    if (value.startsWith('"') || value.startsWith("'")) {
      values[key] = parseQuotedValue(value, value[0]);
    } else {
      values[key] = value.replace(/\s+#.*$/, '').trim();
    }
  }
  return values;
};

export const loadDirectorCutEnv = ({
  cwd = process.cwd(),
  env = process.env,
  files = DEFAULT_DIRECTOR_CUT_ENV_FILES,
} = {}) => {
  const fileValues = {};
  for (const file of files) {
    const filePath = path.resolve(cwd, file);
    if (existsSync(filePath)) {
      Object.assign(fileValues, parseEnvFile(readFileSync(filePath, 'utf8')));
    }
  }

  return {
    ...fileValues,
    ...env,
  };
};
