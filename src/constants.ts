import { pipe } from 'fp-ts/lib/function';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

export const ALL_FILES_CHAR = 'all';

export const EXCLUDE_KEY = 'exclude';

export const CONFIG_GRP_DEST_RECORD_FILE_NAME = 'destinations.json';

export const NOT_FOUND = Symbol('$NOT_FOUND$');

export const SHELL_VARS_TO_CONFIG_GRP_DIRS = ['$DOTFILES', '$DOTS'] as const;

export const SHELL_VARS_TO_CONFIG_GRP_DIRS_STR = '$DOTFILES or $DOTS';

// This isn't in the `utils` file to avoid a cyclic dependency error
export function getAbsolutePathsForFile(fileUrl: string) {
  return pipe(fileUrl, fileURLToPath, (__filename: string) => ({
    __filename,
    __dirname: dirname(__filename),
  }));
}

export const { __dirname } = getAbsolutePathsForFile(import.meta.url);

export enum ExitCodes {
  OK = 0,
  GENERAL = 1,
  COMMAND_NOT_FOUND = 127,
  KILLED = 128,
}

export const DEFAULT_LEFT_PADDING_SIZE = 3;

export enum KILL_SIGNAL {
  INTERRUPT = 'SIGINT',
  TERMINATE = 'SIGTERM',
}

export enum KILL_CODE_NUM_MAP {
  SIGINT = 2,
  SIGTERM = 15,
}
