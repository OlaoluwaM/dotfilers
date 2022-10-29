import * as Rc from 'fp-ts/lib/Record';
import * as TE from 'fp-ts/lib/TaskEither';

import linkCmd from '../cmds/link';
import unlinkCmd from '../cmds/unlink';
import createConfigGroupCmd from '../cmds/createConfigGroup';

import { flow, pipe } from 'fp-ts/lib/function';
import { default as _syncCmd } from '../cmds/sync';
import { CmdFnWithTestOutput, CmdFn } from '../types/index';
import { removeTestOutputFromCommandResponse } from './helpers';

type Commands = 'link' | 'unlink' | 'sync' | 'create';
type CommandAliases = 'ln' | 'un' | 's' | 'c';

type CommandsAndAliases = Commands | CommandAliases;

type CommandCenter = {
  readonly [Key in CommandsAndAliases]: CmdFn;
};

type incompleteCommandCenter = {
  readonly [Key in CommandsAndAliases]: CmdFnWithTestOutput<unknown>;
};

export default function generateCommandCenter(): CommandCenter {
  const syncCmd = _syncCmd();

  const incompleteCommandCenter: incompleteCommandCenter = {
    // Link command
    link: linkCmd,
    ln: linkCmd,

    // Unlink Command
    unlink: unlinkCmd,
    un: unlinkCmd,

    // Config group creation command
    create: createConfigGroupCmd,
    c: createConfigGroupCmd,

    // Sync command
    sync: syncCmd,
    s: syncCmd,
  };

  return pipe(
    incompleteCommandCenter,

    Rc.map(cmdHandlerFn =>
      flow(cmdHandlerFn, TE.map(removeTestOutputFromCommandResponse))
    )
  );
}
