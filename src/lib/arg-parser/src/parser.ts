import * as A from 'fp-ts/lib/Array';
import * as O from 'fp-ts/lib/Option';
import * as S from 'fp-ts/lib/string';

import { not } from 'fp-ts/lib/Predicate';
import { pipe } from 'fp-ts/lib/function';
import { NonEmptyArray } from 'fp-ts/lib/NonEmptyArray';
import { FLAG_PLACEHOLDER_VALUE } from './constants';
import { ParserConfig, Argv, PARSER_TOKEN_TYPE } from './types';
import {
  isOptionStr,
  normalizeOptionStr,
  tokenizeArgvElement,
  withArgvIndexIncrement,
  generateOptionNameAliasMap,
  validOptionResponseConstructor,
  unknownOptionResponseConstructor,
  positionalArgsResponseConstructor,
  removeArgvIndexIncrementProperty,
} from './utils';

export default function* parseCliArgs(parserConfig: ParserConfig, argv: Argv) {
  const aliasParser = parseAliases(parserConfig);
  const longOptionParser = parseLongOption(parserConfig);
  const combinedAliasParser = parseCombinedAliases(parserConfig);
  const optionStringWithValueParser = parseOptionStrWithValue(parserConfig);

  for (let rawArgvStrIndex = 0; rawArgvStrIndex < argv.length; ) {
    const rawArgvStr = argv[rawArgvStrIndex];
    const optionToken = tokenizeArgvElement(rawArgvStr);
    const restOfArgvArr = argv.slice(rawArgvStrIndex + 1);

    switch (optionToken) {
      case PARSER_TOKEN_TYPE.LONG_OPT_STR: {
        const { indexIncrement, ...parserResponse } = longOptionParser(
          rawArgvStr,
          restOfArgvArr
        );

        rawArgvStrIndex += indexIncrement;
        yield parserResponse;

        break;
      }

      case PARSER_TOKEN_TYPE.ALIAS_OPT_STR: {
        const { indexIncrement, ...parserResponse } = aliasParser(
          rawArgvStr,
          restOfArgvArr
        );

        rawArgvStrIndex += indexIncrement;
        yield parserResponse;

        break;
      }

      case PARSER_TOKEN_TYPE.COMBINED_SHORT_OPT_STR: {
        const combinedAliasParserResponse = combinedAliasParser(
          rawArgvStr,
          restOfArgvArr
        );

        // eslint-disable-next-line no-restricted-syntax
        for (const aliasParserResponse of combinedAliasParserResponse) {
          const parserResponse =
            removeArgvIndexIncrementProperty(aliasParserResponse);

          yield parserResponse;
        }

        // The reason we increment directly by one is because the convention with combined aliases is that each alias maps to an option that is a flag
        // 'flag' here means that the option's value is a boolean, when the option is present the value is true and when it isn't it is false.
        // Thus combined aliases do not have values to be skipped over as other kinds of options do, so we simply need to move to the next rawArgString the argv array
        // to continue parsing. As an example: ['--long', 'value' '-abc', '-another-long' 'another-value']
        // The combined aliases '-abc' will always have no values associated with it, so we move to the next option to be parsed which is a +1 from the index of the
        // combined aliases string
        rawArgvStrIndex += 1;
        break;
      }

      case PARSER_TOKEN_TYPE.OPT_STR_WITH_VALUE: {
        const parserResponse = optionStringWithValueParser(rawArgvStr);

        // Same as above, this category of options are usually self-contained: they house both the option name and its value.
        // Thus, the next option string to parse is simply an index away. No need to take into account other values

        rawArgvStrIndex += 1;

        yield parserResponse;
        break;
      }

      case PARSER_TOKEN_TYPE.POSITIONAL_ARG: {
        const parserResponse = positionalArgsResponseConstructor(rawArgvStr);

        // Positional args have no value associated with them. So, after parsing, we move to the next option string to be parsed which will always be an
        // index away
        rawArgvStrIndex += 1;

        yield parserResponse;
        break;
      }

      default: {
        const parserResponse = unknownOptionResponseConstructor(rawArgvStr);

        // Represents the skipping of argv elements that do match any of the above criteria
        rawArgvStrIndex += 1;

        yield parserResponse;
        break;
      }
    }
  }
}

function parseLongOption({ options: optionConfigs }: ParserConfig) {
  return (longOptionStr: string, restOfArgvArr: string[]) => {
    const optionNameWithoutDashPrefix = normalizeOptionStr(longOptionStr);
    const rawOptionValue = pipe(restOfArgvArr, A.takeLeftWhile(not(isOptionStr)));

    const longOptionStrConfig = O.fromNullable(
      optionConfigs[optionNameWithoutDashPrefix]
    );

    return pipe(
      longOptionStrConfig,

      O.foldW(
        () =>
          withArgvIndexIncrement(unknownOptionResponseConstructor)(longOptionStr)(
            rawOptionValue.length
          ),

        optionConfig => {
          const { isFlag } = optionConfig;

          // prettier-ignore
          // eslint-disable-next-line no-nested-ternary
          const optionValue = A.isEmpty(rawOptionValue)
            ? (isFlag ? [FLAG_PLACEHOLDER_VALUE] : null)
            : rawOptionValue;

          return withArgvIndexIncrement(validOptionResponseConstructor)(
            optionNameWithoutDashPrefix,
            optionValue as NonEmptyArray<string> | null
          )(rawOptionValue.length);
        }
      )
    );
  };
}

function parseAliases(parserConfig: ParserConfig) {
  const aliasMap = generateOptionNameAliasMap(parserConfig);

  return (aliasOptionStr: string, restOfArgvArr: string[]) => {
    const aliasWithoutDashPrefix = normalizeOptionStr(aliasOptionStr);
    let correspondingAliasLongName = aliasMap[aliasWithoutDashPrefix];

    if (!correspondingAliasLongName) {
      // Here we are treating those unspecified (not present in configuration) aliases as long options so we can classify them as unknown later on
      // and file them away properly
      correspondingAliasLongName = aliasOptionStr;
    }

    return parseLongOption(parserConfig)(correspondingAliasLongName, restOfArgvArr);
  };
}

function parseCombinedAliases(parserConfig: ParserConfig) {
  const aliasParser = parseAliases(parserConfig);

  return (combinedAliasStr: string, restOfArgvArr: string[]) => {
    const aliasesArr = normalizeOptionStr(combinedAliasStr).split('');

    return pipe(
      aliasesArr,
      A.map(aliasStr => aliasParser(aliasStr, restOfArgvArr))
    );
  };
}

function parseOptionStrWithValue({ options: optionsConfig }: ParserConfig) {
  return (optionStrWithValue: string) => {
    const [optionNameWithoutDashPrefix, optionValue] =
      normalizeOptionStr(optionStrWithValue).split('=');

    return pipe(
      O.fromNullable(optionsConfig[optionNameWithoutDashPrefix]),

      O.foldW(
        unknownOptionResponseConstructor.bind(null, optionStrWithValue),

        () => {
          const parsedOptionValue = S.isEmpty(optionValue)
            ? null
            : ([optionValue] as NonEmptyArray<string>);

          return validOptionResponseConstructor(
            optionNameWithoutDashPrefix,
            parsedOptionValue
          );
        }
      )
    );
  };
}
