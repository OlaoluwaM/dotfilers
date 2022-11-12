#!/usr/bin/env node

import * as A from 'fp-ts/lib/Array';
import * as O from 'fp-ts/lib/Option';
import * as T from 'fp-ts/lib/Task';
import * as RC from 'fp-ts/lib/Record';
import * as IO from 'fp-ts/lib/IO';
import * as TE from 'fp-ts/lib/TaskEither';

import helpCmd from '@cmds/help';
import versionCmd from '@cmds/version';

import { match, P } from 'ts-pattern';
import { ExitCodes } from './constants';
import { flow, pipe } from 'fp-ts/lib/function';
import { isOptionLike, optionConfigConstructor } from '@lib/arg-parser';
import { default as generateCmdHandlerFn, getCliCommand } from '@app/cli';
import {
  parseCmdOptions,
  getOptionsFromParserOutput,
  removeTestOutputFromCommandResponse,
} from '@app/helpers';
import {
  CmdOptions,
  CliInputs,
  toCmdOptions,
  toPositionalArgs,
  ParsedCmdResponse,
  CmdFnWithTestOutput,
} from '@types';
import {
  emptyLog,
  logErrors,
  logOutput,
  logWarnings,
  parseCmdResponse,
  getCliInputsArrFromArgv,
  reArrangeCmdResponseTypeOrder,
} from './utils';

function main(argv: string[]) {
  return pipe(
    TE.Do,
    TE.let('cliInputs', () => getCliInputsArrFromArgv(argv)),

    TE.let('cliCommandHandlerFn', ({ cliInputs }) =>
      pipe(getCliCommand(cliInputs), generateCmdHandlerFn)
    ),

    TE.let('globalCliOptionsParserOutput', ({ cliInputs }) =>
      pipe(cliInputs, getCommandOptions, parseGlobalCliCmdOptions)
    ),

    TE.bind(
      'cliOutput',
      ({ cliCommandHandlerFn, globalCliOptionsParserOutput, cliInputs }) =>
        generateCliOutput(cliCommandHandlerFn)(
          cliInputs,
          globalCliOptionsParserOutput
        )
    ),

    TE.fold(T.fromIO, logCliOutput)
  );
}

function getCommandOptions(cliInputs: CliInputs): CmdOptions {
  return pipe(cliInputs, A.filter(isOptionLike), toCmdOptions);
}

function parseGlobalCliCmdOptions(cmdOptions: CmdOptions) {
  return pipe(
    cmdOptions,
    pipe(generateOptionConfig(), parseCmdOptions),
    parserOutput => ({
      ...parserOutput,

      options: pipe(
        getOptionsFromParserOutput(parserOutput),
        RC.map(O.getOrElse(() => false))
      ),
    })
  );
}

function generateOptionConfig() {
  return {
    options: {
      quiet: optionConfigConstructor({
        parser: () => true,
        isFlag: true,
        aliases: ['q'],
      }),

      version: optionConfigConstructor({
        parser: () => true,
        isFlag: true,
        aliases: ['v'],
      }),

      help: optionConfigConstructor({
        parser: () => true,
        isFlag: true,
        aliases: ['h'],
      }),
    },
  };
}

function generateCliOutput(cliCommandHandlerFn: CmdFnWithTestOutput<unknown>) {
  return (
    cliInputs: CliInputs,
    globalCliOptionsParserOutput: ReturnType<typeof parseGlobalCliCmdOptions>
  ) => {
    const { positionalArgs, options } = globalCliOptionsParserOutput;

    // prettier-ignore
    const cmdHandlerToRun = match([options.help, options.version] as [boolean, boolean])
      .with(P.union([true, false], [true, true]), () => helpCmd)
      .with([false, true], () => versionCmd)
      .with([false, false], () => cliCommandHandlerFn)
      .exhaustive();

    return pipe(
      cmdHandlerToRun(
        toPositionalArgs(positionalArgs),
        getCommandOptions(cliInputs)
      ),
      TE.map(flow(removeTestOutputFromCommandResponse, parseCmdResponse))
    );
  };
}

interface CliOutputLoggerParamObj {
  cliOutput: ParsedCmdResponse;
  globalCliOptionsParserOutput: ReturnType<typeof parseGlobalCliCmdOptions>;
}

function logCliOutput({
  cliOutput,
  globalCliOptionsParserOutput,
}: CliOutputLoggerParamObj) {
  const { options: globalCliOptions } = globalCliOptionsParserOutput;
  return pipe(cliOutput, generateCliOutputFn(globalCliOptions));
}

type ResponseTypeToLoggerFnMapper = {
  [ResponseType in keyof CliOutputLoggerParamObj['cliOutput']]: (
    outputs: string[]
  ) => IO.IO<void>;
};

function generateCliOutputFn(
  globalCliOptions: CliOutputLoggerParamObj['globalCliOptionsParserOutput']['options']
) {
  const { quiet } = globalCliOptions;

  return (cliOutput: CliOutputLoggerParamObj['cliOutput']) => {
    const responseTypeToOutputFn: ResponseTypeToLoggerFnMapper = {
      errors: logErrors,
      warnings: logWarnings,
      output: quiet ? emptyLog : logOutput,
    };

    return pipe(
      cliOutput,
      reArrangeCmdResponseTypeOrder,
      RC.traverseWithIndex(T.ApplicativeSeq)((outputType, outputVals) =>
        pipe(responseTypeToOutputFn[outputType](outputVals), T.fromIO)
      ),
      T.chainIOK(() => () => process.exit(determineExitCode(cliOutput)))
    );
  };
}

function determineExitCode(
  cliOutput: CliOutputLoggerParamObj['cliOutput']
): ExitCodes {
  const { errors } = cliOutput;
  return errors.length > 0 ? ExitCodes.GENERAL : ExitCodes.OK;
}

await pipe(process.argv, main)();
