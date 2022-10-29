import * as L from 'monocle-ts/Lens';

import { not } from 'fp-ts/lib/Predicate';
import { pipe } from 'fp-ts/lib/function';
import { join, uniq } from 'ramda';
import { isString, isEmpty } from 'fp-ts/lib/string';

export class AggregateError extends Error {
  messages: string[] = [];

  constructor(initialMessage: string | Error) {
    super();
    this.messages =
      initialMessage instanceof Error ? [initialMessage.message] : [initialMessage];
  }

  addError(messages: string[] | string) {
    const separateByComma = join(', ');
    const newMessagesToAdd = isString(messages) ? [messages] : messages;

    this.messages = uniq(
      this.messages.concat(newMessagesToAdd).filter(not(isEmpty))
    );
    this.message = `The following errors occurred: ${separateByComma(
      this.messages
    )}`;

    return this;
  }
}

export function newAggregateError(initialMessage: string | Error) {
  return new AggregateError(initialMessage);
}

export function addError(message: string | string[]) {
  return (aggregateErrorInstance: AggregateError) =>
    aggregateErrorInstance.addError(message);
}

export function getErrorMessagesFromAggregateErr(aggregateErrorObj: AggregateError) {
  const MessagesLens = pipe(L.id<AggregateError>(), L.prop('messages'));
  return pipe(aggregateErrorObj, MessagesLens.get);
}
