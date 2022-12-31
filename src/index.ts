#!/usr/bin/env node

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
import { optionConfigConstructor } from '@lib/arg-parser';
import {
  getCliCommand,
  collectCmdOptions,
  collectCmdArguments,
  getCliInputsFromArgv,
  default as generateCmdHandlerFn,
  CliInputs,
} from '@app/cli';
import {
  parseCmdOptions,
  getOptionsFromParserOutput,
  removeTestOutputFromCommandResponse,
} from '@app/helpers';
import {
  CmdOptions,
  toCmdOptions,
  PositionalArgs,
  ParsedCmdResponse,
  CmdFnWithTestOutput,
} from '@types';
import {
  emptyLog,
  logErrors,
  logOutput,
  logWarnings,
  parseCmdResponse,
  reArrangeCmdResponseTypeOrder,
} from './utils';

interface CmdInput {
  options: CmdOptions;
  arguments: PositionalArgs;
}

function main(argv: string[]) {
  return pipe(
    TE.Do,
    TE.let('cliInputs', () => getCliInputsFromArgv(argv)),
    TE.let('cliCmd', ({ cliInputs }) => getCliCommand(cliInputs)),

    TE.let(
      'cmdInput',
      ({ cliInputs, cliCmd }): CmdInput => ({
        options: collectCmdOptions(cliInputs, cliCmd),
        arguments: collectCmdArguments(cliInputs, cliCmd),
      })
    ),

    TE.let('cliCommandHandlerFn', ({ cliCmd }) =>
      pipe(cliCmd, generateCmdHandlerFn)
    ),

    TE.let('globalCliOptionsParserOutput', ({ cliInputs }) =>
      pipe(cliInputs, toCmdOptions, parseGlobalCliCmdOptions)
    ),

    TE.bind(
      'cliOutput',
      ({ cliCommandHandlerFn, globalCliOptionsParserOutput, cmdInput }) =>
        generateCliOutput(cliCommandHandlerFn)(
          cmdInput,
          globalCliOptionsParserOutput
        )
    ),

    TE.fold(T.fromIO, logCliOutput)
  );
}

function parseGlobalCliCmdOptions(cliInput: CliInputs) {
  return pipe(
    cliInput,
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
    cmdInput: CmdInput,
    globalCliOptionsParserOutput: ReturnType<typeof parseGlobalCliCmdOptions>
  ) => {
    const { options: globalCliOptions } = globalCliOptionsParserOutput;
    const { options: cmdOptions, arguments: cmdArguments } = cmdInput;

    // prettier-ignore
    const cmdHandlerToRun = match([globalCliOptions.help, globalCliOptions.version] as [boolean, boolean])
      .with(P.union([true, false], [true, true]), () => helpCmd)
      .with([false, true], () => versionCmd)
      .with([false, false], () => cliCommandHandlerFn)
      .exhaustive();

    return pipe(
      cmdHandlerToRun(cmdArguments, cmdOptions),
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

      T.chainIOK(() =>
        flow(
          () => console.log('\n'),
          () => process.exit(determineExitCode(cliOutput))
        )
      )
    );
  };
}

function determineExitCode(
  cliOutput: CliOutputLoggerParamObj['cliOutput']
): ExitCodes {
  const { errors } = cliOutput;
  return errors.length > 0 ? ExitCodes.GENERAL : ExitCodes.OK;
}

pipe(process.argv, main)();
