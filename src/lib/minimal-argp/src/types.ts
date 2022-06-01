import { NOT_FOUND } from './constants';

export type AnyFunction<RT = any> = (...args: any[]) => RT;

export type RawArgs = string[];

export type Primitive = string | number | boolean | symbol;

export interface AnyObject {
  [key: Exclude<Primitive, boolean>]: unknown;
}

export type OptionTypes = AnyFunction<boolean | string>;

interface OptionInputBase {
  type: OptionTypes;
  // default?: OptionTypes[this['type']];
}

// interface ArgInput {
//   name: string;
//   options?: string[];
//   required?: boolean;
// }

export type ParserParams = {
  options: {
    [OptionName: string]: OptionInputBase & {
      alias?: string;
    };
  };
};

export type ParserParamOption = ParserParams['options'][string];

export type ParserOutput<ParserInput extends ParserParams> = {
  readonly options: {
    readonly [OptionName in keyof ParserInput['options']]: ReturnType<
      ParserInput['options'][OptionName]['type']
    >;
  };
  readonly positionalArgs: string[];
};

export type ParserOutputOptions = ParserOutput<ParserParams>['options']

export type OptionDiscoveryMap = {
  [OptionName: string]: {
    valueInArgv: ReturnType<OptionTypes> | typeof NOT_FOUND;
  };
};

export type OptionDiscoveryMapEntry = OptionDiscoveryMap[string];

export interface ExtendedOptionData extends ParserParamOption, OptionDiscoveryMapEntry {}
