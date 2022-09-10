/**
 * A `Brand` is a type that takes at minimum two type parameters. Given a base
 * type `Base` and some unique and arbitrary branding type `BrandingT`, it
 * produces a type based on but distinct from `Base`.
 *
 * The resulting branded type is not directly assignable from the base type, and not mutually
 * assignable with another branded type derived from the same base type.
 *
 * Take care that the branding type is unique. Two branded types that share the
 * same base type and branding type are considered the same type! There are two
 * ways to avoid this.
 *
 * The first way is to supply a third type parameter, `BrandingProp`, with a
 * string literal or string literal union type that is not `__type__`, which is the default.
 *
 * The second way is to define a branded type in terms of its surrounding
 * interface, thereby forming a recursive type. This is possible because there
 * are no constraints on what the branding type must be. It does not have to
 * be a string literal type, even though it often is.
 *
 * @example
 * ```
 * type Path = Brand<string, 'path'>;
 * type UserId = Brand<number, 'user'>;
 * type DifferentUserId = Brand<number, 'user', '__kind__'>;
 * interface Post { id: Brand<number, Post> }
 * ```
 */
export type Brand<
  Base,
  BrandingT extends string,
  BrandingProp extends string = '__type__'
> = Base extends _AnyBrand
  ? SubBrand<Base, BrandingT, BrandingProp>
  : BasicBrand<Base, BrandingT, BrandingProp>;

type _AnyBrand = unknown & { __inner_tag__: { [K in any]: any } } & {
  __base__: any;
};

type BasicBrand<Base, BrandingT, BrandingProp extends string = '__type__'> = Base & {
  __inner_tag__: { [K in BrandingProp]: BrandingT };
} & { __base__: Base };

type SubBrand<
  Base extends _AnyBrand,
  BrandingT extends string,
  BrandingProp extends string = '__type__'
> = BaseOf<Base> & {
  __inner_tag__: Base['__inner_tag__'] & {
    [_ in BrandingT]: { [K in BrandingProp]: BrandingT };
  };
} & { __base__: BaseOf<Base> };

/**
 * `BaseOf` is a type that takes any branded type `B` and yields its base type.
 */

export type BaseOf<B extends AnyBrand> = B['__base__'];

/**
 * An `AnyBrand` is a branded type based on any base type branded with any
 * branding type. By itself it is not useful, but it can act as type constraint
 * when manipulating branded types in general.
 */
export type AnyBrand = Brand<unknown, any, any>;

/**
 * A `Brander` is a function that takes a value of some base type and casts
 * that value to a branded type derived from said base type. It can be thought
 * of as a data constructor for a Brand, like how quotes construct data that is of type `string`
 *
 * @example
 * ```
 * type UserId = Brand<number, 'user'>;
 * A Brander<UserId> would take a number and return a UserId
 * ```
 */
export type Brander<B extends AnyBrand> = (underlying: BaseOf<B>) => B;

/**
 * A generic function that, when given some branded type, can take a value with
 * the base type of the branded type, and cast that value to the branded type.
 * It fulfills the contract of a `Brander`.
 *
 * At runtime, this function simply returns the value as-is.
 *
 * @param brandBase The value with a base type, to be casted
 * @return The same inputted value, but casted
 * @example
 * ```
 * type UserId = Brand<number, 'user'>;
 * const UserId: Brander<UserId> = identity;
 * ```
 */
function brander<B extends AnyBrand>(brandBase: BaseOf<B>): B {
  return brandBase as B;
}

/**
 * Produces a `Brander<B>`, given a brand type `B`. This simply returns
 * `identity` but relies on type inference to give the return type the correct
 * type.
 *
 * @return `identity`
 * @example
 * ```
 * type UserId = Brand<number, 'user'>;
 * const UserId = make<UserId>();
 * const myUserId = UserId(42);
 * ```
 */
export function createBrander<B extends AnyBrand>(): Brander<B> {
  return brander;
}
