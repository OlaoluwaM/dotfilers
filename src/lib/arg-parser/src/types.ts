import { Option } from 'fp-ts/lib/Option';
import { NonEmptyArray } from 'fp-ts/lib/NonEmptyArray';

export type Argv = string[];

export interface OptionConfig<OptionType> {
  parser: (optionValue: NonEmptyArray<string>) => OptionType;
  default?: OptionType;
  aliases?: string[];
  isFlag?: boolean;
}

export interface ParserConfig {
  options: {
    [OptionName: string]: OptionConfig<unknown>;
  };
}

export interface ParserOutput<PC extends ParserConfig> {
  _: string[];
  positionalArgs: string[];
  options: {
    [OptionName in keyof PC['options']]: Option<
      ReturnType<PC['options'][OptionName]['parser']>
    >;
  };
}

export type DefaultOptionValueMap<PC extends ParserConfig> = {
  [OptionName in keyof PC['options']]: Option<PC['options'][OptionName]['default']>;
};

export type ResolvedParserOutput<PC extends ParserConfig> = {
  _: string[];
  positionalArgs: string[];
  options: {
    [OptionName in keyof PC['options']]: Option<NonEmptyArray<string>>;
  };
};

export type AliasMap = {
  [Alias: string]: string;
};

export enum PARSER_OUTPUT_TOKEN_TYPE {
  UNKNOWN_OPTION = 'UNKNOWN_OPTION',
  POSITIONAL_ARG = 'POSITIONAL_ARG',
  VALID_OPTION = 'VALID_OPTION',
}

export interface UnknownOption {
  resultType: PARSER_OUTPUT_TOKEN_TYPE.UNKNOWN_OPTION;
  optionName: string;
}

export interface ValidOption {
  resultType: PARSER_OUTPUT_TOKEN_TYPE.VALID_OPTION;
  optionName: string;
  optionValue: Option<NonEmptyArray<string>>;
}

export interface PositionalArg {
  resultType: PARSER_OUTPUT_TOKEN_TYPE.POSITIONAL_ARG;
  argName: string;
}

export type ParserResponse = UnknownOption | ValidOption | PositionalArg;

export enum PARSER_TOKEN_TYPE {
  // Example: ['--long', 'value']
  LONG_OPT_STR = 'LONG_OPT_STR',

  // Example: ['-l', '2']
  ALIAS_OPT_STR = 'ALIAS_OPT_STR',

  // Example: ['arg1', 'arg2', 'arg3']
  POSITIONAL_ARG = 'POSITIONAL_ARG_TOKEN',

  // Example: ['--amount=5']
  OPT_STR_WITH_VALUE = 'OPT_STR_WITH_VALUE',

  // Example: ['-abc']. Where a, b, and c are aliases for flags
  COMBINED_SHORT_OPT_STR = 'COMBINED_SHORT_OPT_STR',
}
