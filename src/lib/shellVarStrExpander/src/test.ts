import { map } from 'ramda';
import { NOT_FOUND } from './constants';
import { test, expect } from '@jest/globals';
import { array, string } from 'fp-ts';
import { replaceShellVarsInString } from './index';

test('Should ensure that it is possible to expand shell variables in strings to their original values', () => {
  // Arrange
  const eqInstForArrOfStrings = array.getEq(string.Eq);

  const mockShellVariableMap = {
    HOME: 'home/test',
    DEV: 'home/test/dev',
    PROD: 'somewhere/application/prod',
    get OTHER() {
      return `${this.HOME}/${this.PROD}/some/void`;
    },
  };

  const mockShellVarExpansionFunc = replaceShellVarsInString(mockShellVariableMap);

  // Act
  /* eslint-disable no-template-curly-in-string */
  const testCaseArr = [
    '$HOME/devion/rico',
    '${DEV}/dotfilers',
    '$HOME/app/${PROD}',
    '$NON_EXISTENT/some/path',
    '$OTHER/in/space',
    'home/test/dev/sample/rice',
    'home/test/dev',
    '',
  ];
  /* eslint-enable no-template-curly-in-string */

  const testCaseResultsArr = map(mockShellVarExpansionFunc, testCaseArr);

  const testCaseExpectedResultArr = [
    `${mockShellVariableMap.HOME}/devion/rico`,
    `${mockShellVariableMap.DEV}/dotfilers`,
    `${mockShellVariableMap.HOME}/app/${mockShellVariableMap.PROD}`,
    `${NOT_FOUND}/some/path`,
    `${mockShellVariableMap.OTHER}/in/space`,
    'home/test/dev/sample/rice',
    'home/test/dev',
    '',
  ];

  // Assert
  expect(
    eqInstForArrOfStrings.equals(testCaseResultsArr, testCaseExpectedResultArr)
  ).toBeTruthy();
});
