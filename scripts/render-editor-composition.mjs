#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_ENTRY_POINT = 'remotion/index.ts';
const DEFAULT_COMPOSITION_ID = 'VideoEditorComposition';
const DEFAULT_CODEC = 'h264';

const printUsage = () => {
  console.log(`
Usage:
  npm run remotion:render:editor -- --props ./editor-render-manifest.json --out ./export.mp4

Options:
  --props, --manifest   Path to an editor Remotion manifest or raw EditorComposition props JSON.
  --out                 Output .mp4 path.
  --entry               Remotion entry point. Defaults to ${DEFAULT_ENTRY_POINT}.
  --composition         Remotion composition ID. Defaults to ${DEFAULT_COMPOSITION_ID}.
  --codec               Remotion codec. Defaults to ${DEFAULT_CODEC}.
  --crf                 Optional h264 CRF value.
  --x264-preset         Optional x264 preset.
  --concurrency         Optional Remotion concurrency.
  --dry-run             Print the Remotion command without running it.
`);
};

export const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    if (key === 'dry-run' || key === 'help') {
      args[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    index += 1;
  }
  return args;
};

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

const readJson = (filePath) => {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`JSON file does not exist: ${absolutePath}`);
  }
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
};

export const getInputProps = (rawJson) => {
  const inputProps = isRecord(rawJson) && isRecord(rawJson.inputProps) ? rawJson.inputProps : rawJson;
  if (!isRecord(inputProps)) {
    throw new Error('Input JSON must be an object.');
  }
  if (!Array.isArray(inputProps.clips)) {
    throw new Error('Input props must include a clips array.');
  }
  if (!Array.isArray(inputProps.audioTracks)) {
    throw new Error('Input props must include an audioTracks array.');
  }
  if (!Array.isArray(inputProps.keyframes)) {
    throw new Error('Input props must include a keyframes array.');
  }
  if (!isRecord(inputProps.composition)) {
    throw new Error('Input props must include a composition object.');
  }
  return inputProps;
};

export const buildRemotionArgs = ({
  entry,
  composition,
  out,
  propsPath,
  codec,
  crf,
  x264Preset,
  concurrency,
}) => {
  const args = [
    'render',
    entry,
    composition,
    out,
    '--props',
    propsPath,
    '--codec',
    codec,
    '--overwrite',
  ];

  if (crf) args.push('--crf', crf);
  if (x264Preset) args.push('--x264-preset', x264Preset);
  if (concurrency) args.push('--concurrency', concurrency);
  return args;
};

export const main = async (argv = process.argv.slice(2)) => {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return;
  }

  const propsFile = args.props ?? args.manifest;
  if (!propsFile) {
    throw new Error('Missing --props or --manifest.');
  }
  if (!args.out) {
    throw new Error('Missing --out.');
  }

  const inputProps = getInputProps(readJson(propsFile));
  const tempDir = mkdtempSync(path.join(tmpdir(), 'worldstudio-remotion-'));
  const propsPath = path.join(tempDir, 'editor-props.json');
  writeFileSync(propsPath, `${JSON.stringify(inputProps, null, 2)}\n`);

  const remotionBin = path.resolve(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'remotion.cmd' : 'remotion'
  );
  const remotionArgs = buildRemotionArgs({
    entry: args.entry ?? DEFAULT_ENTRY_POINT,
    composition: args.composition ?? DEFAULT_COMPOSITION_ID,
    out: args.out,
    propsPath,
    codec: args.codec ?? DEFAULT_CODEC,
    crf: args.crf,
    x264Preset: args['x264-preset'],
    concurrency: args.concurrency,
  });

  if (args['dry-run']) {
    console.log(JSON.stringify({ command: remotionBin, args: remotionArgs }, null, 2));
    rmSync(tempDir, { recursive: true, force: true });
    return;
  }

  await new Promise((resolve, reject) => {
    const child = spawn(remotionBin, remotionArgs, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      rmSync(tempDir, { recursive: true, force: true });
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Remotion render failed with exit code ${code}`));
      }
    });
  });
};

const isCliEntrypoint = () => process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCliEntrypoint()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    printUsage();
    process.exit(1);
  });
}
