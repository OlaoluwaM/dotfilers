import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as S from 'fp-ts/lib/Separated';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';

import path from 'path';

import { chalk } from 'zx/.';
import { exitCli } from '@app/helpers';
import { match, P } from 'ts-pattern';
import { writeFile } from 'fs/promises';
import { pipe, flow } from 'fp-ts/lib/function';
import { newAggregateError } from '@utils/AggregateError';
import {
  PositionalArgs,
  CmdFnWithTestOutput,
  CmdResponseWithTestOutput,
} from '../types/index';
import { CONFIG_GRP_DEST_RECORD_FILE_NAME, ExitCodes } from '../constants';
import { bind, createDirIfItDoesNotExist, doesPathExist } from '@utils/index';
import {
  DEFAULT_DEST_RECORD_FILE_CONTENTS,
  generateAbsolutePathToConfigGroupDir,
} from '@app/configGroup';

export default function main(
  cmdArguments: PositionalArgs | [],
  _: []
): ReturnType<CmdFnWithTestOutput<string[]>> {
  return match(cmdArguments)
    .with([], () => TE.left(exitCli(generateCmdFatalErrMsg(), ExitCodes.GENERAL)))
    .with(P.array(P.string), (__, value) =>
      pipe(createConfigGroupDir(value), TE.rightTask)
    )
    .exhaustive();
}

function generateCmdFatalErrMsg() {
  return chalk.red.bold('No config group names were specified. Exiting...');
}

interface ConfigGroupDirCreationResponse {
  readonly configGroupPathGenerationResult: ReturnType<
    typeof generatePathsToPotentialConfigGroupDirs
  >;

  readonly configGroupDirCreationResult: S.Separated<string[], string[]>;
}

function createConfigGroupDir(configGroupNames: string[]) {
  return pipe(
    T.Do,

    T.let(
      'configGroupPathGenerationResult',
      bind(generatePathsToPotentialConfigGroupDirs)(configGroupNames)
    ),

    T.bind(
      'configGroupDirCreationResult',
      ({
        configGroupPathGenerationResult: {
          right: allAbsPathsToPotentialConfigGroups,
        },
      }) =>
        pipe(
          allAbsPathsToPotentialConfigGroups,
          A.wilt(T.ApplicativePar)(generateConfigGroupDirForNonExistingOnes)
        )
    ),

    T.map(generateCmdResponse)
  );
}

function generateCmdResponse(
  configGroupDirCreationResponse: ConfigGroupDirCreationResponse
): CmdResponseWithTestOutput<string[]> {
  const { configGroupDirCreationResult, configGroupPathGenerationResult } =
    configGroupDirCreationResponse;

  const { left: pathGenerationErrors, right: allAbsPathsToPotentialConfigGroups } =
    configGroupPathGenerationResult;

  const { left: warningsForExistingGroups, right: groupCreationOutput } =
    configGroupDirCreationResult;

  return {
    errors: pathGenerationErrors,
    warnings: warningsForExistingGroups,
    output: groupCreationOutput,
    testOutput: allAbsPathsToPotentialConfigGroups,
  };
}

function generatePathsToPotentialConfigGroupDirs(configGroupNames: string[]) {
  return pipe(
    configGroupNames,
    A.map(configGroupName =>
      pipe(
        configGroupName,
        generateAbsolutePathToConfigGroupDir,
        E.fromOption(generateConfigGroupDirPathCreationError(configGroupName))
      )
    ),
    A.separate
  );
}

function generateConfigGroupDirPathCreationError(configGroupName: string) {
  return () =>
    newAggregateError(
      `Error, could not generate a path to the ${configGroupName} config group`
    );
}

function generateConfigGroupDirForNonExistingOnes(absPath: string) {
  return pipe(
    doesPathExist(absPath),
    TE.swap,
    TE.mapLeft(() => `${absPath} already exists. Skipping...`),
    TE.chainW(flow(() => absPath, createDirIfItDoesNotExist, TE.fromTask)),
    TE.chainFirstTaskK(() => createDefaultDestinationRecordFile(absPath)),
    TE.map(() => `${path.basename(absPath)} config group created (${absPath})`)
  );
}

function createDefaultDestinationRecordFile(configGroupDirPath: string) {
  return async () => {
    const fileName = path.join(configGroupDirPath, CONFIG_GRP_DEST_RECORD_FILE_NAME);

    return await writeFile(
      fileName,
      JSON.stringify(DEFAULT_DEST_RECORD_FILE_CONTENTS),
      'utf-8'
    );
  };
}
