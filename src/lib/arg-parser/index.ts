import optionParser from './src';
import { createOptionConfig, isOptionStr } from './src/utils';
import { ParserOutput, ParserConfig } from '@lib/arg-parser/src/types';

const parseArgv = optionParser;
type AnyParserOutput = ParserOutput<ParserConfig>;

export default parseArgv;

export const optionConfigConstructor = createOptionConfig;
export const isOptionLike = isOptionStr;

export type { ParserOutput, ParserConfig, AnyParserOutput };
