export type EnumKeys<E> = keyof E;

export enum LogLevels {
  INFO = 1,
  DEBUG = 2,
  WARN = 3,
  ERROR = 4,
}

export type LogTypes = EnumKeys<typeof LogLevels>;
