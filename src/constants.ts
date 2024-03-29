import { pipe } from 'fp-ts/lib/function';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { default as ora, Options } from 'ora';

export const ALL_FILES_CHAR = 'all';

export const EXCLUDE_KEY = 'exclude';

export const CONFIG_GRP_DEST_RECORD_FILE_NAME = 'destinations.json';

export const NOT_FOUND = Symbol('$NOT_FOUND$');

export const SHELL_VARS_TO_CONFIG_GRP_DIRS = ['$DOTFILES', '$DOTS'] as const;

export const SHELL_VARS_TO_CONFIG_GRP_DIRS_STR = '$DOTFILES or $DOTS';

export const SHELL_EXEC_MOCK_VAR_NAME = 'SHELL_MOCK_' as const;

export const SHELL_EXEC_MOCK_ERROR_HOOK = '$$ERROR$$';

// This isn't in the `utils` file to avoid a cyclic dependency error
export function getAbsolutePathsForFile(fileUrl: string) {
  return pipe(fileUrl, fileURLToPath, (__filename: string) => ({
    __filename,
    __dirname: dirname(__filename),
  }));
}

// Courtesy of https://antfu.me/posts/isomorphic-dirname
// We use `typeof __dirname` instead of `__dirname ??` because we do not want Node to
// evaluate the meaning of `__dirname` when it is not in a CJS module as doing so will cause Node
// to error out without actually evaluating the conditional expression
export const _dirname =
  typeof __dirname === 'undefined'
    ? getAbsolutePathsForFile(import.meta.url).__dirname
    : __dirname;

const spinnerOptions: Options = {
  spinner: 'dots',
};

export const spinner = ora(spinnerOptions);

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
