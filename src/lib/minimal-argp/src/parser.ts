import { NOT_FOUND } from './constants';
import { ExtendedOptionData, OptionTypes } from './types';

const NO_CUSTOM_DEFAULT = Symbol('No custom default');

export default class OptionValueParser {
  parseOptionVal(
    optionData: ExtendedOptionData,
    customParser: ExtendedOptionData['type']
  ) {
    const { valueInArgv: optionValue, type } = optionData;
    const optionValueIfNonExistent = this.getValueForOptionWhenItDoesNotExist(type);

    if (optionValue === NOT_FOUND) return optionValueIfNonExistent;
    return customParser(optionValue);
  }

  getValueForOptionWhenItDoesNotExist<
    CustomDefault extends unknown = typeof NO_CUSTOM_DEFAULT
  >(
    optionType: OptionTypes,
    customDefaultValue = NO_CUSTOM_DEFAULT as CustomDefault
  ): false | undefined | CustomDefault {
    if (customDefaultValue !== NO_CUSTOM_DEFAULT) return customDefaultValue;

    switch (optionType) {
      case Boolean:
        return false;

      default:
        return undefined;
    }
  }
}
