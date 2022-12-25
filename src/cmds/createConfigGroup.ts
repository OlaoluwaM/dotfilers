import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as O from 'fp-ts/lib/Option';
import * as S from 'fp-ts/lib/Separated';
import * as T from 'fp-ts/lib/Task';
import * as RC from 'fp-ts/lib/Record';
import * as TE from 'fp-ts/lib/TaskEither';
import * as RTE from 'fp-ts/lib/ReaderTaskEither';

import path from 'path';
import chalk from 'chalk';

import { match, P } from 'ts-pattern';
import { writeFile } from 'fs/promises';
import { newAggregateError } from '@utils/AggregateError';
import { optionConfigConstructor } from '@lib/arg-parser';
import { exitCli, getParsedOptions } from '@app/helpers';
import { pipe, flow, constTrue, constant } from 'fp-ts/lib/function';
import { CONFIG_GRP_DEST_RECORD_FILE_NAME, ExitCodes } from '../constants';
import { bind, createDirIfItDoesNotExist, doesPathExist } from '@utils/index';
import {
  DEFAULT_DEST_RECORD_FILE_CONTENTS,
  generateAbsolutePathToConfigGroupDir,
} from '@app/configGroup';
import {
  CmdOptions,
  PositionalArgs,
  CmdFnWithTestOutput,
  CmdResponseWithTestOutput,
} from '@types';

interface ParsedCmdOptions {
  readonly regular: boolean;
}

export default function main(
  cmdArguments: PositionalArgs,
  cmdOptions: CmdOptions
): ReturnType<CmdFnWithTestOutput<string[]>> {
  const parsedCmdOptions: ParsedCmdOptions = parseCmdOptions(cmdOptions);

  return match(cmdArguments)
    .with([], () => TE.left(exitCli(generateCmdFatalErrMsg(), ExitCodes.GENERAL)))
    .with(P.array(P.string), (__, value) =>
      pipe(createConfigGroupDir(value)(parsedCmdOptions), TE.rightTask)
    )
    .exhaustive();
}

function parseCmdOptions(cmdOptions: CmdOptions): ParsedCmdOptions {
  return pipe(
    cmdOptions,
    pipe(generateOptionConfig(), getParsedOptions),
    RC.map(O.getOrElse(() => false))
  );
}

function generateOptionConfig() {
  return {
    options: {
      regular: optionConfigConstructor({
        parser: constTrue,
        isFlag: true,
        aliases: ['r'],
      }),
    },
  };
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
  return ({ regular: shouldCreateRegularDir }: ParsedCmdOptions) =>
    pipe(
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
            A.wilt(T.ApplicativePar)(
              generateConfigGroupDirForNonExistingOnes(shouldCreateRegularDir)
            )
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

function generateConfigGroupDirForNonExistingOnes(
  shouldCreateRegularDir: boolean
): RTE.ReaderTaskEither<string, string, string> {
  return (absPath: string) =>
    pipe(
      doesPathExist(absPath),
      TE.swap,
      TE.mapLeft(() => `${absPath} already exists. Skipping...`),
      TE.chainW(flow(constant(absPath), createDirIfItDoesNotExist, TE.fromTask)),
      TE.chainFirstTaskK(
        flow(
          constant(absPath),
          determineDirectoryTypeToCreate(shouldCreateRegularDir)
        )
      ),
      TE.map(() => `"${path.basename(absPath)}" config group created (${absPath})`)
    );
}

function determineDirectoryTypeToCreate(shouldCreateRegularDir: boolean) {
  return (absPath: string) =>
    shouldCreateRegularDir
      ? T.of(undefined)
      : createDefaultDestinationRecordFile(absPath);
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
