import * as O from 'fp-ts/lib/Option';
import * as S from 'fp-ts/lib/string';

import { not } from 'fp-ts/lib/Predicate';
import { pipe } from 'fp-ts/lib/function';
import { Reader } from 'fp-ts/lib/Reader';
import { replace } from 'ramda';

interface ShellVariableMap {
  [variableName: string]: string | undefined;
}

const NOT_FOUND = '$NOT_FOUND';

export function expandShellVariablesInString(strWithShellVars: string) {
  return replaceShellVarsInString(process.env)(strWithShellVars);
}

// NOTE: Exposed for testing purposes ONLY!!
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
  return pipe(
    stringifiedShellVar,
    resolveTildeAliasIfNeeded,
    determineShellVariableValues
  );
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
