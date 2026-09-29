import { appendFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const inActions = Boolean(process.env.GITHUB_ACTIONS);

export const isMain = (url) => {
  try {
    return Boolean(process.argv[1]) && url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
};

// Escape user-controlled text so it cannot inject workflow commands.
const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => esc(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function annotate(level, message, file) {
  if (inActions) console.log(`::${level}${file ? ` file=${escProp(file)}` : ''}::${esc(message)}`);
  else console.error(`${level}: ${file ? `${file}: ` : ''}${message}`);
}

export function setOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  else console.log(`[output] ${key}=${value}`);
}

export function appendSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}
