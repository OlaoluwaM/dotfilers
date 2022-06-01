import { NOT_FOUND } from './constants';
import { isEmpty, objSet, isOption } from './utils';
import {
  OptionTypes,
  ParserParams,
  OptionDiscoveryMap,
  OptionDiscoveryMapEntry,
  ExtendedOptionData as ImportedExtendedOptionData,
} from './types';

type AliasName = string;
type OptionName = string;

type AliasMap = Record<AliasName, OptionName>;

interface ExtendedOptionData extends Omit<ImportedExtendedOptionData, 'valueInArgv'> {
  indexDiscoveredAt: number;
}

export default class OptionsDiscoverer {
  #aliasMap: AliasMap;
  #passedOptions: ParserParams['options'];
  #optionDiscoveryMap: OptionDiscoveryMap;

  constructor(optionsToDiscover: ParserParams['options']) {
    this.#passedOptions = optionsToDiscover;

    const generatedAliasMap = this.#generateAliasMap(optionsToDiscover);
    this.#aliasMap = generatedAliasMap;

    const initialOptionDiscoveryMap =
      this.#generateInitialOptionDiscoveryMap(optionsToDiscover);

    this.#optionDiscoveryMap = initialOptionDiscoveryMap;
  }

  #generateAliasMap(passedOptions: ParserParams['options']): AliasMap {
    const optionsArray = Object.entries(passedOptions);

    const aliasMap = optionsArray.reduce(
      (initAliasMap, [currentOptionName, currentOptionObj]) => {
        const { alias: optionAliasChar } = currentOptionObj;
        if (!optionAliasChar) return initAliasMap;

        initAliasMap[optionAliasChar] = currentOptionName;
        return initAliasMap;
      },
      {} as AliasMap
    );

    return aliasMap;
  }

  #generateInitialOptionDiscoveryMap(
    passedOptions: ParserParams['options']
  ): OptionDiscoveryMap {
    const optionNames = Object.keys(passedOptions);

    const initialOptionDiscoveryMap = optionNames.reduce(
      (initialMap, currentOptionName) => {
        const optionDiscoveryMap = objSet(initialMap, currentOptionName, {
          valueInArgv: NOT_FOUND,
        });

        return optionDiscoveryMap;
      },
      {} as OptionDiscoveryMap
    );

    return initialOptionDiscoveryMap;
  }

  findOptionsInPassedArgs(argv: string[]): OptionDiscoveryMap {
    // "partially immutable" because we can change the value of existing members
    // But we cannot add new members to the object
    const partiallyImmutableOptionDiscoveryMap = Object.seal({
      ...this.#optionDiscoveryMap,
    });

    const updatedOptionDiscoveryMap = argv.reduce(
      (currOptionDiscoveryMap, potentialOption, potentialOptionIndex, argsArr) => {
        const longOptionName = this.#getOptionLongName(potentialOption);
        if (isEmpty.string(longOptionName)) return currOptionDiscoveryMap;

        const optionData: ExtendedOptionData = {
          ...this.#passedOptions[longOptionName],
          indexDiscoveredAt: potentialOptionIndex,
        };

        const updatedOptionDiscoveryMapEntryForPotentialOption =
          this.#createUpdatedDiscoveryMapEntry(optionData, argsArr);

        const newOptionDiscoveryMap = objSet(
          currOptionDiscoveryMap,
          longOptionName,
          updatedOptionDiscoveryMapEntryForPotentialOption
        );

        return newOptionDiscoveryMap;
      },
      partiallyImmutableOptionDiscoveryMap
    );

    return updatedOptionDiscoveryMap;
  }

  #createUpdatedDiscoveryMapEntry(
    optionData: ExtendedOptionData,
    argsArr: string[]
  ): OptionDiscoveryMapEntry {
    const { type: optionType, indexDiscoveredAt } = optionData;

    const discoveredOptionData = { optionType, indexDiscoveredAt };
    const optionValue = this.#getOptionValue(discoveredOptionData, argsArr);

    const newOptionDiscoveryMapEntry: OptionDiscoveryMapEntry = {
      valueInArgv: optionValue,
    };

    return newOptionDiscoveryMapEntry;
  }

  #getOptionValue(
    discoveredOptionData: {
      optionType: OptionTypes;
      indexDiscoveredAt: number;
    },
    argArr: string[]
  ): ReturnType<OptionTypes> {
    const { optionType, indexDiscoveredAt } = discoveredOptionData;
    const optionIsAFlag = this.#isFlag(optionType);

    let optionValue: OptionDiscoveryMapEntry['valueInArgv'];

    if (optionIsAFlag) {
      optionValue = argArr[indexDiscoveredAt];
    } else optionValue = argArr[indexDiscoveredAt + 1];

    return optionValue;
  }

  #isFlag(optionType: OptionTypes): boolean {
    const FLAG_TYPE = Boolean;
    return optionType === FLAG_TYPE;
  }

  #getOptionLongName(potentialOption: string): string {
    const NO_LONG_NAME = '';

    const ALIAS_FLAG_PREFIX = '-';
    const NORMAL_OPTION_FLAG_PREFIX = '--';

    const isANormalOption = isOption(potentialOption, 'normal');
    const isAnAlias = isOption(potentialOption, 'alias');

    if (!(isANormalOption || isAnAlias)) return NO_LONG_NAME;

    const FLAG_PREFIX = isAnAlias ? ALIAS_FLAG_PREFIX : NORMAL_OPTION_FLAG_PREFIX;
    const potentialLongOptionName = potentialOption.replace(FLAG_PREFIX, '');

    return isAnAlias
      ? this.#resolveAliasToOptionName(potentialLongOptionName)
      : potentialLongOptionName;
  }

  #resolveAliasToOptionName(
    aliasChar: string
  ): Exclude<keyof OptionDiscoveryMap, number> | '' {
    const longOptionName = this.#aliasMap[aliasChar] ?? '';
    return longOptionName;
  }
}
