/**
 * Structured logging. Workers observability indexes the JSON fields, so every
 * line is emitted as one object rather than interpolated text -- that is what
 * makes "show me every failed run of tiktok.publish" a query rather than a
 * grep.
 */
type Fields = Record<string, unknown>;

function emit(level: 'debug' | 'info' | 'warn' | 'error', message: string, fields?: Fields): void {
  const line = JSON.stringify({ level, message, ts: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (message: string, fields?: Fields) => emit('debug', message, fields),
  info: (message: string, fields?: Fields) => emit('info', message, fields),
  warn: (message: string, fields?: Fields) => emit('warn', message, fields),
  error: (message: string, fields?: Fields) => emit('error', message, fields),
};

/** Normalizes anything thrown into a loggable shape. */
export function errorFields(err: unknown): Fields {
  return err instanceof Error
    ? { error: err.message, stack: err.stack }
    : { error: String(err) };
}
