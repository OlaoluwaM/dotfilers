import { AnyObject, Primitive } from './types';
import { OPTIONS_REGEX } from './constants';

export function isOptionLike(potentialOption: string): boolean {
  return isOption(potentialOption, 'normal') || isOption(potentialOption, 'alias');
}

export function isOption(potentialOption: string, type: 'normal' | 'alias'): boolean {
  const LONG_OPTION_REGEX = OPTIONS_REGEX.long;
  const SHORT_OPTION_REGEX = OPTIONS_REGEX.short;

  const REGEX_TO_USE = type === 'normal' ? LONG_OPTION_REGEX : SHORT_OPTION_REGEX;
  const isPotentialOptionAnOption = REGEX_TO_USE.test(potentialOption);

  return isPotentialOptionAnOption;
}

export default function doesObjectHaveProperty(
  obj: AnyObject,
  property: Exclude<Primitive, boolean>
): boolean {
  return Object.prototype.hasOwnProperty.call(obj, property);
}

export function objSet<
  Obj extends AnyObject,
  Prop extends string | number,
  NewValue extends Obj[Prop]
>(obj: Obj, property: Prop, value: NewValue) {
  const objHasProperty = doesObjectHaveProperty(obj, property);
  const ObjIsSealed = Object.isSealed(obj);
  const objIsFrozen = Object.isFrozen(obj);

  const objCannotBeModified = (ObjIsSealed && !objHasProperty) || objIsFrozen;
  if (objCannotBeModified) return obj;

  return {
    ...obj,
    ...{ [property]: value },
  } as { [Key in keyof Obj | Prop]: Key extends Prop ? NewValue : Obj[Key] };
}

export const isEmpty = {
  obj(possiblyEmptyObj: AnyObject): boolean {
    const hasNoProperties = Object.keys(possiblyEmptyObj).length === 0;
    return hasNoProperties;
  },

  array(possiblyEmptyArr: unknown[]): boolean {
    return possiblyEmptyArr.length === 0;
  },

  string(possiblyEmptyString: string): boolean {
    const EMPTY_STRING = '' as const;
    return possiblyEmptyString === EMPTY_STRING;
  },
};

type PredicateFn<T> = (currentValue: T, currentElemInd: number, array: T[]) => boolean;
export function removeFromArr<ArrT>(array: ArrT[], predicate: PredicateFn<ArrT>) {
  const result = array.filter((...args) => !predicate(...args));
  return result;
}
