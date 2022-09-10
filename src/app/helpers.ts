import * as N from 'fp-ts/lib/number';
import * as T from 'fp-ts/lib/Task';
import * as IO from 'fp-ts/lib/IO';
import * as RA from 'fp-ts/lib/ReadonlyArray';
import * as Sep from 'fp-ts/lib/Separated';

import prompts from 'prompts';

import { match } from 'ts-pattern';
import { globby } from 'zx/';
import { compose } from 'ramda';
import { contramap } from 'fp-ts/lib/Ord';
import { flow, pipe } from 'fp-ts/lib/function';
import { getAllDirNamesAtFolderPath } from '@utils/index';
import { expandShellVariablesInString } from '@lib/shellVarStrExpander';
import { LinkCmdOperationType, RawFile } from '@types';
import {
  ExitCodes,
  SHELL_VARS_TO_CONFIG_GRP_DIRS,
  CONFIG_GRP_DEST_RECORD_FILE_NAME,
} from '../constants';

export function getAllFilesFromDirectory(dirPath: string): T.Task<RawFile[]> {
  return async () =>
    (await globby('**/*', {
      ignore: [CONFIG_GRP_DEST_RECORD_FILE_NAME],
      onlyFiles: true,
      cwd: dirPath,
      absolute: true,
      objectMode: true,
      dot: true,
    })) as unknown as RawFile[];
}

export function exitCli(
  msg: string,
  exitCode: ExitCodes = ExitCodes.OK
): IO.IO<never> {
  return () => {
    console.log(msg);
    process.exit(exitCode);
  };
}

export function exitCliWithCodeOnly(
  exitCode: ExitCodes = ExitCodes.OK
): IO.IO<never> {
  return () => {
    process.exit(exitCode);
  };
}

export const linkOperationTypeToPastTense: Record<LinkCmdOperationType, string> = {
  copy: 'copied',
  hardlink: 'hardlinked',
  symlink: 'symlinked',
};

export async function optionallyGetAllConfigGrpNamesInExistence() {
  const shouldProceedWithGettingAllConfigGrpNames = () =>
    prompts(
      {
        type: 'confirm',
        name: 'answer',
        message: 'Do you wish to operate on all config groups?',
        initial: false,
      },
      { onCancel: () => false }
    );

  // eslint-disable-next-line no-return-await
  return await pipe(
    shouldProceedWithGettingAllConfigGrpNames,
    T.map(({ answer }: { answer: boolean }) =>
      match(answer)
        .with(false, () => ExitCodes.OK as const)
        .with(true, getAllConfigGrpNames)
        .exhaustive()
    )
  )();
}

async function getAllConfigGrpNames() {
  const byLength = pipe(
    N.Ord,
    contramap((arr: string[]) => arr.length)
  );

  const allPossibleConfigGrpNames = await pipe(
    SHELL_VARS_TO_CONFIG_GRP_DIRS,
    RA.wilt(T.ApplicativePar)(
      compose(getAllDirNamesAtFolderPath, expandShellVariablesInString)
    )
  )();

  const { right: allConfigGrpNamesOption } = pipe(
    allPossibleConfigGrpNames,
    Sep.map(flow(RA.sortBy([byLength]), RA.head))
  );

  return allConfigGrpNamesOption;
}
