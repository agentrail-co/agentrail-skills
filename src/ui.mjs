// Terminal output and questions, with no dependencies. Colour only on a
// terminal, and never when NO_COLOR is set.

import { createInterface } from 'node:readline/promises';

export function createUi({ input = process.stdin, output = process.stdout, env = process.env } = {}) {
  const colour = Boolean(output.isTTY) && !env.NO_COLOR && env.TERM !== 'dumb';
  const paint = (code) => (text) => (colour ? `\u001b[${code}m${text}\u001b[0m` : String(text));
  const style = {
    bold: paint('1'),
    dim: paint('2'),
    green: paint('32'),
    yellow: paint('33'),
    red: paint('31'),
    cyan: paint('36'),
  };

  // Lines are queued as they arrive, so answers piped in all at once (by a
  // script or a test) are not lost between questions.
  let rl;
  const lines = [];
  const waiting = [];
  let ended = false;
  const reader = () => {
    if (rl) return rl;
    rl = createInterface({ input, terminal: false });
    rl.on('line', (line) => (waiting.length > 0 ? waiting.shift()(line) : lines.push(line)));
    rl.on('close', () => {
      ended = true;
      while (waiting.length > 0) waiting.shift()(null);
    });
    return rl;
  };
  const nextLine = () => {
    reader();
    if (lines.length > 0) return Promise.resolve(lines.shift());
    if (ended) return Promise.resolve(null);
    return new Promise((resolve) => waiting.push(resolve));
  };

  const say = (text = '') => output.write(`${text}\n`);

  async function ask(question, fallback) {
    output.write(`${style.cyan('?')} ${question} `);
    const line = await nextLine();
    if (line === null) throw new Error('No more answers: the input ended.');
    if (!output.isTTY) output.write('\n');
    const answer = line.trim();
    return answer === '' ? fallback : answer;
  }

  /** One choice from a numbered list; Enter takes the default. */
  async function choose(question, options, defaultIndex = 0) {
    say(`${style.cyan('?')} ${style.bold(question)}`);
    options.forEach((option, index) => {
      const marker = index === defaultIndex ? style.green('›') : ' ';
      say(`  ${marker} ${index + 1}) ${option.label}${option.hint ? `  ${style.dim(option.hint)}` : ''}`);
    });
    for (;;) {
      const answer = await ask(`Your choice [${defaultIndex + 1}]:`, String(defaultIndex + 1));
      const index = Number.parseInt(answer, 10) - 1;
      if (Number.isInteger(index) && index >= 0 && index < options.length) return options[index].value;
      say(style.yellow(`  Enter a number from 1 to ${options.length}.`));
    }
  }

  /** Several choices from a numbered list; Enter keeps the ticked ones. */
  async function chooseMany(question, options, ticked) {
    say(`${style.cyan('?')} ${style.bold(question)}`);
    options.forEach((option, index) => {
      const box = ticked.includes(option.value) ? style.green('[x]') : '[ ]';
      say(`  ${box} ${String(index + 1).padStart(2)}) ${option.label}${option.hint ? `  ${style.dim(option.hint)}` : ''}`);
    });
    const defaults = options
      .map((option, index) => (ticked.includes(option.value) ? index + 1 : null))
      .filter((index) => index !== null);
    for (;;) {
      const answer = await ask(
        `Numbers separated by commas, "all", or Enter for ${defaults.length > 0 ? defaults.join(',') : 'none'}:`,
        defaults.join(','),
      );
      if (answer.toLowerCase() === 'all') return options.map((option) => option.value);
      const picked = answer
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((part) => Number.parseInt(part, 10) - 1);
      if (picked.length > 0 && picked.every((index) => Number.isInteger(index) && index >= 0 && index < options.length))
        return [...new Set(picked)].map((index) => options[index].value);
      say(style.yellow(`  Enter numbers from 1 to ${options.length}, such as 1,3.`));
    }
  }

  async function confirm(question, fallback = true) {
    for (;;) {
      const answer = (await ask(`${question} ${fallback ? '[Y/n]' : '[y/N]'}`, fallback ? 'y' : 'n')).toLowerCase();
      if (['y', 'yes'].includes(answer)) return true;
      if (['n', 'no'].includes(answer)) return false;
      say(style.yellow('  Answer y or n.'));
    }
  }

  const close = () => rl?.close();

  return { say, ask, choose, chooseMany, confirm, close, style };
}
