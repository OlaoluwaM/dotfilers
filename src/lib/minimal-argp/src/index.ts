import OptionValueParser from './parser';
import OptionsDiscoverer from './find';

import { isEmpty, isOptionLike, objSet, removeFromArr } from './utils';
import {
  ParserOutput,
  ParserParams,
  ExtendedOptionData,
  OptionDiscoveryMap,
} from './types';

export default class ArgParser<ParserInput extends ParserParams> {
  #passedOptions: ParserInput['options'];
  #optionsDiscoverer: OptionsDiscoverer;

  #optionValueParser = new OptionValueParser();

  constructor(parserOptions: ParserInput) {
    const { options } = parserOptions;
    this.#passedOptions = options;

    this.#optionsDiscoverer = new OptionsDiscoverer(options);
  }

  public parse(argv: string[]): ParserOutput<ParserInput> {
    if (isEmpty.array(argv)) return this.#generateDefaultParserOutput();

    const discoveredOptions = this.#optionsDiscoverer.findOptionsInPassedArgs(argv);

    const partialParserOutput = this.#parseDiscoveredOptions(discoveredOptions);
    const positionalArgs = this.#getPositionalArgsFromRawArgumentsArr(argv);

    const parserOutput = objSet(partialParserOutput, 'positionalArgs', positionalArgs);
    return parserOutput as ParserOutput<ParserInput>;
  }

  #generateDefaultParserOutput(): ParserOutput<ParserInput> {
    const passedOptions = { ...this.#passedOptions };
    const passedOptionsEntries = Object.entries(passedOptions);

    const optionsWithDefaultValueEntries = passedOptionsEntries.map(
      ([optionName, optionData]) => [
        optionName,
        this.#optionValueParser.getValueForOptionWhenItDoesNotExist(optionData.type),
      ]
    );

    const defaultParserOutput: ParserOutput<ParserInput> = {
      options: Object.fromEntries(optionsWithDefaultValueEntries),
      positionalArgs: [],
    };

    return defaultParserOutput;
  }

  #parseDiscoveredOptions(
    optionDiscoveryMap: OptionDiscoveryMap
  ): Omit<ParserOutput<ParserInput>, 'positionalArgs'> {
    const optionsObjEntriesArr = Object.entries(this.#passedOptions)

    const parserOutputObjEntriesArr = optionsObjEntriesArr.map(
      ([optionName, optionData]) => {
        const { valueInArgv } = optionDiscoveryMap[optionName];
        const customParser = optionData.type;

        const extendedOptionData: ExtendedOptionData = { ...optionData, valueInArgv };
        const optionValue = this.#optionValueParser.parseOptionVal(
          extendedOptionData,
          customParser
        );

        return [optionName, optionValue];
      }
    );

    const parserOutputForOptions = Object.fromEntries(
      parserOutputObjEntriesArr
    ) as ParserOutput<ParserInput>['options'];

    return { options: parserOutputForOptions };
  }

  #getPositionalArgsFromRawArgumentsArr(argv: string[]): string[] {
    const positionalArgs = removeFromArr(argv, isOptionLike);
    return positionalArgs;
  }
}
