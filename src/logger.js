/**
 * A very small levelled logger.
 *
 * Not a logging framework — just enough that a self-hosted instance produces
 * greppable, timestamped lines instead of bare console.log calls.
 */

import { config } from "./config.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function emit(level, stream, message, meta) {
  if (LEVELS[level] < threshold) return;
  const time = new Date().toISOString();
  const suffix = meta === undefined ? "" : ` ${typeof meta === "string" ? meta : JSON.stringify(meta)}`;
  stream(`${time} ${level.toUpperCase().padEnd(5)} ${message}${suffix}`);
}

export const log = {
  debug: (message, meta) => emit("debug", console.log, message, meta),
  info: (message, meta) => emit("info", console.log, message, meta),
  warn: (message, meta) => emit("warn", console.warn, message, meta),
  error: (message, meta) => emit("error", console.error, message, meta),
};
