import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// The sim must give identical results in every JavaScript engine (docs/sim-spec.md section 4).
// These are the only Math functions it may use; the others can differ between engines.
const ALLOWED_MATH = ['floor', 'ceil', 'round', 'trunc', 'min', 'max', 'abs', 'sqrt', 'imul'];
const WHY = 'the sim must be deterministic (docs/sim-spec.md section 4)';
// The server's game code also runs in the browser for offline games (docs/server-spec.md section 3).
const BROWSER_SAFE = 'it also runs in the browser; only server.ts and main.ts may use Node (docs/server-spec.md section 3)';

export default defineConfig(
  { ignores: ['**/node_modules/', '**/dist/', '**/coverage/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['packages/sim/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: `No time APIs: ${WHY}.` },
        { name: 'Intl', message: `No locale APIs: ${WHY}.` },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: `MemberExpression[object.name='Math'][property.name!=/^(${ALLOWED_MATH.join('|')})$/]`,
          message: `Only Math.${ALLOWED_MATH.join('/')} are allowed, and randomness comes from the seeded generator in rng.ts: ${WHY}.`,
        },
        {
          // Keeps the allow-list above from being bypassed, e.g. `const { sin } = Math`.
          selector: "Identifier[name='Math']:not(MemberExpression > Identifier.object)",
          message: `Use Math only as Math.<function>(...): ${WHY}.`,
        },
        {
          selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']",
          message: `No exponentiation; use a lookup table or repeated multiplication: ${WHY}.`,
        },
      ],
    },
  },
  {
    files: ['packages/server/src/**/*.ts'],
    ignores: ['packages/server/src/server.ts', 'packages/server/src/main.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['node:*', 'ws', 'fs', 'path', 'http', 'https', 'crypto', 'url', 'os'], message: `No Node modules: ${BROWSER_SAFE}.` }] },
      ],
      'no-restricted-globals': [
        'error',
        ...['process', 'Buffer', 'Date', 'setTimeout', 'setInterval'].map((name) => ({
          name,
          message: `Time and randomness come from the Host, and Node globals are off limits: ${BROWSER_SAFE}.`,
        })),
      ],
    },
  },
);
