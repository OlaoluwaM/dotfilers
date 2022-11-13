/* globals test, expect */
import * as A from 'fp-ts/lib/Array';
import * as O from 'fp-ts/lib/Option';
import * as R from 'fp-ts/lib/Record';

import optionParser from './src/index';

import { identity, pipe } from 'fp-ts/lib/function';
import { createOptionConfig, trace } from './src/utils';

test('Should ensure that CLI argument parser works as intended ', () => {
  // Arrange
  const expectedPositionalArgs = ['tt', 'ferfer', 'fe', 'erge', 'ferfer'];

  const expectedOptions = {
    long: 'aaa',
    many: 16,
    ama: true,
    bar: true,
    cat: false,
  };

  const expectedUnknownOptions = ['--vaer', '--ragnarok', '-o'];

  const sampleArgv = [
    ...expectedPositionalArgs,
    // This was added to test if the arg-parser is smart enough to NOT consider the values of unknown options as positional args
    '-i',
    'jjjj',
    '--many=8',
    '-ab',
    ...expectedUnknownOptions,
  ];

  const parserConfig = {
    options: {
      long: createOptionConfig({
        parser: ([optionValue]) => String(optionValue),
        default: 'aaa',
        aliases: ['l'],
      }),

      many: createOptionConfig({
        parser: ([optionValue]) => Number(optionValue) * 2,
      }),

      ama: createOptionConfig({
        parser: _ => true,
        isFlag: true,
        aliases: ['a'],
      }),

      bar: createOptionConfig({
        parser: _ => true,
        isFlag: true,
        aliases: ['b'],
      }),

      cat: createOptionConfig({
        parser: _ => true,
        isFlag: true,
        aliases: ['c'],
      }),
    },
  };

  // Act
  const parserOutput = optionParser(parserConfig)(sampleArgv);

  const { options, positionalArgs, _: unknownOptions } = parserOutput;

  // Assert
  expect(options).toMatchObject(pipe(expectedOptions, R.map(O.some)));
  expect(positionalArgs).toIncludeSameMembers(expectedPositionalArgs);
  expect(unknownOptions).toIncludeSameMembers(expectedUnknownOptions.concat(['-i']));
});

test('Should ensure parser can handle options that are not present in argv but have been specified in config without a default value', () => {
  // Arrange
  const expectedPositionalArgs = ['tt', 'ferfer', 'fe', 'erge', 'ferfer'];

  const expectedOptions = {
    long: O.none,
    miles: O.some(10),
    numOfPeople: O.some('5 people'),
  };

  const expectedUnknownOptions = ['--vaer', '--ragnarok', '-o'];

  const sampleArgv = [
    ...expectedPositionalArgs,
    '-m',
    '10',
    '-n',
    '5',
    ...expectedUnknownOptions,
  ];

  const parserConfig = {
    options: {
      long: createOptionConfig({
        parser: ([optionValue]) => String(optionValue),
      }),

      miles: createOptionConfig({
        parser: ([optionValue]) => Number(optionValue),
        aliases: ['m'],
      }),

      numOfPeople: createOptionConfig({
        parser: ([optionValue]) => `${optionValue} people`,
        aliases: ['n'],
      }),
    },
  };

  // Act
  const parserOutput = optionParser(parserConfig)(sampleArgv);

  const { options, positionalArgs, _: unknownOptions } = parserOutput;

  // Assert
  expect(options).toMatchObject(expectedOptions);
  expect(positionalArgs).toIncludeSameMembers(expectedPositionalArgs);
  expect(unknownOptions).toIncludeSameMembers(expectedUnknownOptions);
});

test('Should ensure parser has predictable behavior when it stumbles across an option with multiple values', () => {
  // Arrange
  const expectedPositionalArgs = ['tt', 'ferfer', 'fe', 'erge', 'ferfer'];
  const multiValueOptionValsArr = ['John', 'Stacy', 'Mack', 'Arik', 'Halima', 'Nir'];

  const expectedOptions = {
    namesOfPeople: O.some(multiValueOptionValsArr),
  };

  const expectedUnknownOptions = ['--vaer', '--ragnarok', '-o'];

  const sampleArgv = [
    ...expectedPositionalArgs,
    '-n',
    ...multiValueOptionValsArr,
    ...expectedUnknownOptions,
  ];

  const parserConfig = {
    options: {
      namesOfPeople: createOptionConfig({
        parser: identity,
        aliases: ['n'],
      }),
    },
  };

  // Act
  const parserOutput = optionParser(parserConfig)(sampleArgv);

  const { options, positionalArgs, _: unknownOptions } = parserOutput;

  // Assert
  expect(options).toMatchObject(expectedOptions);
  expect(positionalArgs).toIncludeSameMembers(expectedPositionalArgs);
  expect(unknownOptions).toIncludeSameMembers(expectedUnknownOptions);
});

test('Should ensure options passed multiple times with different sets of values are merged into a single array of values', () => {
  // Arrange
  const expectedPositionalArgs = ['tt', 'ferfer', 'fe', 'erge', 'ferfer'];

  const optionValues = [
    ['John', 'Stacy', 'Mack', 'Arik', 'Halima', 'Nir'],
    ['Abby', 'Gale'],
  ];

  const expectedOptions = {
    namesOfPeople: O.some(optionValues[0]),
    other: O.some(optionValues[1]),
  };

  const expectedUnknownOptions = ['--vaer', '--ragnarok', '-g'];

  const randomSplit = (arr: string[]) =>
    pipe(Math.floor(Math.random() * A.size(arr)), trace('randomSplit: '));

  const [firstOptionValsFirstSplit, firstOptionValsSecondSplit] = pipe(
    optionValues[0],
    A.splitAt(randomSplit(optionValues[0]))
  );

  const [secondOptionValFirstSplit, secondOptionValSecondSplit] = pipe(
    optionValues[1],
    A.splitAt(randomSplit(optionValues[1]))
  );

  const sampleArgv = [
    ...expectedPositionalArgs,

    '-n',
    ...firstOptionValsFirstSplit,
    '-n',
    ...firstOptionValsSecondSplit,

    '-o',
    ...secondOptionValFirstSplit,
    '-o',
    ...secondOptionValSecondSplit,

    ...expectedUnknownOptions,
  ];

  const parserConfig = {
    options: {
      namesOfPeople: createOptionConfig({
        parser: identity,
        aliases: ['n'],
      }),

      other: createOptionConfig({
        parser: identity,
        aliases: ['o'],
      }),
    },
  };

  // Act
  const parserOutput = optionParser(parserConfig)(sampleArgv);

  const { options, positionalArgs, _: unknownOptions } = parserOutput;

  // Assert
  expect(options).toMatchObject(expectedOptions);
  expect(positionalArgs).toIncludeSameMembers(expectedPositionalArgs);
  expect(unknownOptions).toIncludeSameMembers(expectedUnknownOptions);
});

test('Should check that parser can handle edge case where non of the specified options are present in the argv array', () => {
  // Arrange
  const expectedPositionalArgs = ['tt', 'ferfer', 'fe', 'erge', 'ferfer'];

  const expectedOptions = {
    namesOfPeople: O.none,
    ama: O.none,
    ttt: O.none,
    razzy: O.none,
  };

  const expectedUnknownOptions = ['--vaer', '--ragnarok', '-o'];

  const sampleArgv = [...expectedPositionalArgs, ...expectedUnknownOptions];

  const parserConfig = {
    options: {
      namesOfPeople: createOptionConfig({
        parser: identity,
      }),

      ama: createOptionConfig({
        parser: identity,
      }),

      ttt: createOptionConfig({
        parser: identity,
      }),

      razzy: createOptionConfig({
        parser: identity,
      }),
    },
  };

  // Act
  const parserOutput = optionParser(parserConfig)(sampleArgv);

  const { options, positionalArgs, _: unknownOptions } = parserOutput;

  // Assert
  expect(options).toMatchObject(expectedOptions);
  expect(positionalArgs).toIncludeSameMembers(expectedPositionalArgs);
  expect(unknownOptions).toIncludeSameMembers(expectedUnknownOptions);
});

test('Parser should declare all options as un-found (excluding flags, those should be false) if argv array is empty', () => {
  // Arrange

  const expectedOptions = {
    namesOfPeople: O.none,
    ama: O.none,
    ttt: O.none,
    razzy: O.some(false),
  };

  const sampleArgv = [] as string[];

  const parserConfig = {
    options: {
      namesOfPeople: createOptionConfig({
        parser: identity,
      }),

      ama: createOptionConfig({
        parser: identity,
      }),

      ttt: createOptionConfig({
        parser: identity,
      }),

      razzy: createOptionConfig({
        parser: identity,
        isFlag: true,
      }),
    },
  };

  // Act
  const parserOutput = optionParser(parserConfig)(sampleArgv);

  const { options, positionalArgs, _: unknownOptions } = parserOutput;

  // Assert
  expect(options).toMatchObject(expectedOptions);
  expect(positionalArgs).toBeEmpty();
  expect(unknownOptions).toBeEmpty();
});
