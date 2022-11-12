import * as A from 'fp-ts/lib/Array';
import * as L from 'monocle-ts/lib/Lens';
import * as O from 'fp-ts/lib/Option';
import * as RC from 'fp-ts/lib/Record';
import * as MO from 'monocle-ts/lib/Optional';
import * as NEA from 'fp-ts/lib/NonEmptyArray';

import parseCliArgs from './parser';

import { last } from 'fp-ts/lib/Semigroup';
import { flow, identity, pipe } from 'fp-ts/lib/function';
import {
  Argv,
  OptionConfig,
  ParserConfig,
  ParserOutput,
  ParserResponse,
  ResolvedParserOutput,
  DefaultOptionValueMap,
  PARSER_OUTPUT_TOKEN_TYPE,
} from './types';

export default function optionParser<PC extends ParserConfig>(parserConfig: PC) {
  return (argv: Argv) => {
    const defaultOptionValueMap =
      generateDefaultOptionValueMapValueMap(parserConfig);

    const parsedCliArgEntries = Array.from(parseCliArgs(parserConfig, argv));

    return pipe(
      parsedCliArgEntries,
      resolveParsedCliArgEntries,
      parseEntriesInResolvedParserOutputObj(parserConfig),
      mergeParserOutputWithDefaults(defaultOptionValueMap)
    ) as ParserOutput<PC>;
  };
}

function generateDefaultOptionValueMapValueMap<PC extends ParserConfig>({
  options,
}: PC) {
  const defaultValueOptional: MO.Optional<unknown, unknown> = {
    getOption: defaultVal => O.fromNullable(defaultVal),
    set: _ => identity,
  };

  const defaultOptionValueLens = pipe(
    L.id<OptionConfig<unknown>>(),
    L.prop('default'),
    L.composeOptional(defaultValueOptional)
  );

  return pipe(
    options,
    RC.map(flow(fillInDefaultValuesForFlags, defaultOptionValueLens.getOption))
  ) as DefaultOptionValueMap<PC>;
}

function fillInDefaultValuesForFlags(optionConfig: OptionConfig<unknown>) {
  return {
    ...optionConfig,
    // For flags we know the default can only ever be true or false.
    // Thus we try to fill in a default value for as long as the option is specified to be a flag
    // However we must take into consideration that the default value might have been set in the option configuration and we would not want to overwrite it
    // Here we take advantage of the fact that !!undefined === false, so we get the following results
    // If option is flag and option default value is not set (optionConfig.default === undefined), fill in a default value of false
    // If option is flag and option default value is set (optionConfig.default === true or false), Use default value as is: !!true === true and !!false === false
    // If option is not a flag, then leave things be
    default: optionConfig.isFlag ? !!optionConfig.default : optionConfig.default,
  };
}

function resolveParsedCliArgEntries(
  parsedCliArgEntries: ParserResponse[]
): ResolvedParserOutput<ParserConfig> {
  const initialResolvedParserOutputObj: ResolvedParserOutput<ParserConfig> = {
    _: [],
    options: {},
    positionalArgs: [],
  };

  return pipe(
    parsedCliArgEntries,

    A.reduce(
      initialResolvedParserOutputObj,

      (resolvedParserResponseObj, parserResponseEntry) => {
        switch (parserResponseEntry.resultType) {
          case PARSER_OUTPUT_TOKEN_TYPE.VALID_OPTION: {
            const { optionName, optionValue: currentOptionValue } =
              parserResponseEntry;

            const previousOptionValue =
              resolvedParserResponseObj.options[optionName] ?? O.none;

            const MonoidOptionValue = O.getMonoid(NEA.getSemigroup<string>());

            resolvedParserResponseObj.options[optionName] = MonoidOptionValue.concat(
              previousOptionValue,
              currentOptionValue
            );

            break;
          }

          case PARSER_OUTPUT_TOKEN_TYPE.POSITIONAL_ARG:
            resolvedParserResponseObj.positionalArgs.push(
              parserResponseEntry.argName
            );
            break;

          case PARSER_OUTPUT_TOKEN_TYPE.UNKNOWN_OPTION:
            resolvedParserResponseObj._.push(parserResponseEntry.optionName);
            break;

          default:
            break;
        }

        return resolvedParserResponseObj;
      }
    )
  );
}

function parseEntriesInResolvedParserOutputObj<PC extends ParserConfig>(
  parserConfig: ParserConfig
) {
  return (resolvedParserOutputObj: ResolvedParserOutput<PC>): ParserOutput<PC> => {
    const OptionsLens = pipe(L.id<ResolvedParserOutput<PC>>(), L.prop('options'));

    const parsedOptions = pipe(
      resolvedParserOutputObj,
      OptionsLens.get,
      RC.mapWithIndex((optionName, rawOptionValue) =>
        pipe(
          rawOptionValue,
          O.map(optionValue => {
            const { parser, isFlag } = parserConfig.options[optionName];
            return isFlag ? true : parser(optionValue);
          })
        )
      )
    ) as ParserOutput<PC>['options'];

    return { ...resolvedParserOutputObj, options: parsedOptions };
  };
}

function mergeParserOutputWithDefaults(
  defaultOptionValueMap: DefaultOptionValueMap<ParserConfig>
) {
  return (parserOutputObj: ParserOutput<ParserConfig>) => {
    const MonoidDefaultValMerge = O.getMonoid<unknown>(last<unknown>());
    const OptionsLens = pipe(L.id<ParserOutput<ParserConfig>>(), L.prop('options'));

    return pipe(
      OptionsLens,

      L.modify(passedOptionsValueMap =>
        RC.getMonoid(MonoidDefaultValMerge).concat(
          defaultOptionValueMap,
          passedOptionsValueMap
        )
      )
    )(parserOutputObj);
  };
}
