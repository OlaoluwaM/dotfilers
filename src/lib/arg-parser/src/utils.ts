import * as A from 'fp-ts/lib/Array';
import * as O from 'fp-ts/lib/Option';
import * as R from 'fp-ts/lib/Reader';
import * as S from 'fp-ts/lib/string';
import * as Rc from 'fp-ts/lib/Record';

import { pipe } from 'fp-ts/lib/function';
import { omit } from 'ramda';
import { match } from 'ts-pattern';
import { MonoidAny } from 'fp-ts/lib/boolean';
import { NonEmptyArray } from 'fp-ts/lib/NonEmptyArray';
import { optionStrPredicate } from './constants';
import {
  AliasMap,
  ValidOption,
  OptionConfig,
  ParserConfig,
  PositionalArg,
  UnknownOption,
  ParserResponse,
  PARSER_TOKEN_TYPE,
  PARSER_OUTPUT_TOKEN_TYPE,
} from './types';

// ! To mitigate some limitations with generic interfaces where type parameters cannot be inferred through usage and require a constructor of sorts to verify type information
export function createOptionConfig<OptionType>(
  rawOptionConfig: OptionConfig<OptionType>
): OptionConfig<OptionType> {
  return rawOptionConfig;
}

export function generateOptionNameAliasMap({ options }: ParserConfig): AliasMap {
  const createAliasMapEntries = (optionName: string) =>
    A.map<string, [string, string]>(alias => [alias, optionName]);

  return pipe(
    options,
    Rc.toEntries,
    A.chain(([optionName, { aliases = [] }]) =>
      createAliasMapEntries(optionName)(aliases)
    ),
    Rc.fromEntries
  );
}

export function normalizeOptionStr(optionStr: string): string {
  const OPTION_STRING_PREFIX_REGEX = /^--|^-/;
  return optionStr.replace(OPTION_STRING_PREFIX_REGEX, '');
}

export function isOptionStr(potentialOptionStr: string): boolean {
  return pipe(
    optionStrPredicate,
    Rc.reduce(S.Ord)(MonoidAny.empty, (isOptionStrBool, optionStrPredicateFn) =>
      MonoidAny.concat(isOptionStrBool, optionStrPredicateFn(potentialOptionStr))
    )
  );
}

export function tokenizeArgvElement(argvElem: string): PARSER_TOKEN_TYPE {
  return match(argvElem)
    .when(optionStrPredicate.isLong, () => PARSER_TOKEN_TYPE.LONG_OPT_STR)
    .when(optionStrPredicate.isAlias, () => PARSER_TOKEN_TYPE.ALIAS_OPT_STR)
    .when(
      optionStrPredicate.isCombinedShort,
      () => PARSER_TOKEN_TYPE.COMBINED_SHORT_OPT_STR
    )
    .when(
      optionStrPredicate.containsValue,
      () => PARSER_TOKEN_TYPE.OPT_STR_WITH_VALUE
    )
    .otherwise(() => PARSER_TOKEN_TYPE.POSITIONAL_ARG);
}

export function unknownOptionResponseConstructor(optionName: string): UnknownOption {
  return {
    resultType: PARSER_OUTPUT_TOKEN_TYPE.UNKNOWN_OPTION,
    optionName,
  };
}

export function validOptionResponseConstructor(
  optionName: string,
  optionValue: NonEmptyArray<string> | null | undefined
): ValidOption {
  return {
    resultType: PARSER_OUTPUT_TOKEN_TYPE.VALID_OPTION,
    optionName,
    optionValue: O.fromNullable(optionValue),
  };
}

export function positionalArgsResponseConstructor(argName: string): PositionalArg {
  return {
    resultType: PARSER_OUTPUT_TOKEN_TYPE.POSITIONAL_ARG,
    argName,
  };
}

type WithArgvIndexIncrement<PR extends ParserResponse> = PR & {
  indexIncrement: number;
};

export function withArgvIndexIncrement<
  ParserResponseConstructor extends (...args: any[]) => ParserResponse
>(parserResponseConstructor: ParserResponseConstructor) {
  return (
      ...parserResponseConstructorArgs: Parameters<ParserResponseConstructor>
    ): R.Reader<number, WithArgvIndexIncrement<ParserResponse>> =>
    (indexIncrementCount: number) => {
      const parserResponse = parserResponseConstructor(
        ...parserResponseConstructorArgs
      );

      return { ...parserResponse, indexIncrement: indexIncrementCount + 1 };
    };
}

export function removeArgvIndexIncrementProperty<PR extends ParserResponse>(
  parserResponseWithArgvIncrementProp: WithArgvIndexIncrement<PR>
) {
  return omit(['indexIncrement'])(
    parserResponseWithArgvIncrementProp
  ) as unknown as PR;
}

// NOTE: For debugging purposes only
export function trace<T>(...logContents: string[]) {
  return (val: T) => {
    const otherLogContents = A.isEmpty(logContents) ? ['Output: '] : logContents;
    console.log(...otherLogContents, val);
    return val;
  };
}
