import * as N from 'fp-ts/lib/number';
import * as O from 'fp-ts/lib/Option';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as IO from 'fp-ts/lib/IO';
import * as RA from 'fp-ts/lib/ReadonlyArray';
import * as Sep from 'fp-ts/lib/Separated';

import path from 'path';
import prompts from 'prompts';

import { not } from 'fp-ts/lib/Predicate';
import { match } from 'ts-pattern';
import { Reader } from 'fp-ts/Reader';
import { contramap } from 'fp-ts/lib/Ord';
import { flow, pipe } from 'fp-ts/lib/function';
import { compose, replace } from 'ramda';
import { LinkCmdOperationType } from '@types';
import { getAllDirNamesAtFolderPath } from '../utils/index';
import { ExitCodes, NOT_FOUND, SHELL_VARS_TO_CONFIG_GRP_DIRS } from '../constants';

interface ShellVariableMap {
  [variableName: string]: string | undefined;
}

export function expandShellVariablesInString(strWithShellVars: string) {
  return replaceShellVarsInString(process.env)(strWithShellVars);
}

export function replaceShellVarsInString(shellVariableValueMap: ShellVariableMap) {
  const SHELL_ENV_VAR_REGEX =
    /(?:(?:\\{2})*)\$(?:(?:[=|-]?([A-Z0-9_]*[A-Z_]+[A-Z0-9_]*)|(?:{[=|-]?([A-Z0-9_]*[A-Z_]+[A-Z0-9_]*)})))|~/gi;

  return replace(
    SHELL_ENV_VAR_REGEX,
    performSubstitutionOnShellVariables(shellVariableValueMap)
  );
}

function performSubstitutionOnShellVariables(
  shellVariableValueMap: ShellVariableMap
) {
  return (shellVarStr: string) =>
    pipe(
      shellVariableValueMap,
      resolveShellVariable(shellVarStr),
      O.getOrElse(() => NOT_FOUND)
    );
}

function resolveShellVariable(stringifiedShellVar: string) {
  return compose(
    determineShellVariableValues,
    resolveTildeAliasIfNeeded
  )(stringifiedShellVar);
}

function resolveTildeAliasIfNeeded(possibleTildeAlias: string) {
  if (possibleTildeAlias === '~') return '$HOME';
  return possibleTildeAlias;
}

function determineShellVariableValues(strWithShellVars: string) {
  const CURLY_BRACKET_REGEX = /[\{\}]/g;

  return pipe(
    strWithShellVars,
    S.slice(1, Infinity),
    replace(CURLY_BRACKET_REGEX, ''),
    lookupShellVariableValues
  );
}

export const getEnv = (potentialShellVariable: string) =>
  lookupShellVariableValues(potentialShellVariable)(process.env);

function lookupShellVariableValues(
  potentialShellVariable: string
): Reader<ShellVariableMap, O.Option<string>> {
  return shellVariableValueMap =>
    pipe(
      O.fromNullable(shellVariableValueMap[potentialShellVariable]),
      O.filter(not(S.isEmpty))
    );
}

export const isValidShellExpansion = S.includes(NOT_FOUND);

export function resolvePathToDestinationFile(fileName: string) {
  return (absPath: string) => path.resolve(absPath, fileName);
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
