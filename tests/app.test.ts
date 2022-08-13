/* global describe, test, expect */
import { map } from 'ramda';
import { NOT_FOUND } from '../src/constants';
import { array, string } from 'fp-ts';
import { replaceShellVarsInString } from '../src/app/helpers';

describe('Test for helpers', () => {
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
    ];
    /* eslint-enable no-template-curly-in-string */

    const testCaseResultsArr = map(mockShellVarExpansionFunc, testCaseArr);

    const testCaseExpectedResultArr = [
      `${mockShellVariableMap.HOME}/devion/rico`,
      `${mockShellVariableMap.DEV}/dotfilers`,
      `${mockShellVariableMap.HOME}/app/${mockShellVariableMap.PROD}`,
      `${NOT_FOUND}/some/path`,
      `${mockShellVariableMap.OTHER}/in/space`,
    ];

    // Assert
    expect(
      eqInstForArrOfStrings.equals(testCaseResultsArr, testCaseExpectedResultArr)
    ).toBeTruthy();
  });
});
