// /* eslint-disable @typescript-eslint/no-explicit-any -- this is experimental code */
// import { v } from "convex/values";
// import type { ObjectType, PropertyValidators } from "convex/values";
// import { ConvexBuilder, createBuilder } from "fluent-convex";
// import {
//   ConvexBuilderWithFunctionKind,
//   ConvexBuilderWithHandler,
//   ConvexArgsValidator,
//   ConvexReturnsValidator,
//   Context,
//   ConvexBuilderDef,
//   FunctionType,
//   GenericDataModel,
// } from "fluent-convex";
// import { DatabaseReader } from "./_generated/server";
// import { DataModel } from "./_generated/dataModel";

// class Builder {
//   input<TSchema extends PropertyValidators>(schema: TSchema) {
//     return new BuilderWithInput(schema);
//   }
// }

// class BuilderWithInput<
//   TSchema extends PropertyValidators,
//   TArgs = ObjectType<TSchema>,
// > {
//   constructor(private readonly schema: TSchema) {}

//   handler<Return>(fn: (args: TArgs) => Return | Promise<Return>) {
//     const handlerFn = async (args: TArgs): Promise<Return> => {
//       return await fn(args);
//     };
//     handlerFn.schema = this.schema;
//     return handlerFn;
//   }
// }

// const builder = new Builder();

// // Type to extract schema from methods that have one
// type ExtractSchemas<T> = {
//   [K in keyof T as T[K] extends { schema: PropertyValidators }
//     ? K
//     : never]: T[K] extends { schema: infer S } ? S : never;
// };

// // Base class with automatic schema extraction
// class ServiceBase {
//   constructor(..._args: any[]) {}

//   private static _schemasCache = new WeakMap<
//     new (...args: any[]) => ServiceBase,
//     Record<string, PropertyValidators>
//   >();

//   static getSchemas<T extends ServiceBase>(
//     this: new (...args: any[]) => T,
//   ): ExtractSchemas<T> {
//     const cached = ServiceBase._schemasCache.get(this);
//     if (cached) return cached as ExtractSchemas<T>;

//     const temp = new this({} as any);
//     const schemas: Record<string, PropertyValidators> = {};

//     for (const key of Object.keys(temp)) {
//       const prop = (temp as any)[key];
//       if (typeof prop === "function" && "schema" in prop)
//         schemas[key] = prop.schema;
//     }

//     ServiceBase._schemasCache.set(this, schemas);
//     return schemas as ExtractSchemas<T>;
//   }
// }

// // Type to extract methods that have schemas
// type MethodsWithSchemas<T> = {
//   [K in keyof T]: T[K] extends { schema: PropertyValidators } ? K : never;
// }[keyof T];

// class ExperimentsService extends ServiceBase {
//   constructor(private readonly db: DatabaseReader) {
//     super();
//   }

//   list = builder.input({}).handler(({}) => this.db.query("nodes").collect());

//   listWithLimit = builder
//     .input({ limit: v.number() })
//     .handler(async ({ limit }) => {
//       const nodes = await this.list({});
//       if (nodes.length > limit) throw new Error("Limit exceeded");
//       return nodes;
//     });
// }

// class MyExtendedQueryBuilder<
//   TDataModel extends GenericDataModel = GenericDataModel,
// > extends ConvexBuilder<TDataModel> {
//   constructor(builder: ConvexBuilder<TDataModel>) {
//     super((builder as any).def);
//   }

//   // A custom method that modifies the builder state and RE-WRAPS it
//   fromService<
//     TServiceClass extends typeof ServiceBase & {
//       new (db: DatabaseReader): InstanceType<TServiceClass>;
//     },
//     TMethodName extends MethodsWithSchemas<InstanceType<TServiceClass>>,
//   >(clazz: TServiceClass, functionName: TMethodName) {
//     type ServiceInstance = InstanceType<TServiceClass>;
//     type Method = ServiceInstance[TMethodName];
//     type Args = Method extends (args: infer A) => any ? A : never;
//     type Return = Method extends (args: any) => infer R
//       ? R extends Promise<infer P>
//         ? P
//         : R
//       : never;
//     type ExtractSchema<TMethod> = TMethod extends { schema: infer TSchema }
//       ? TSchema extends PropertyValidators
//         ? TSchema
//         : never
//       : never;

//     const schemas = clazz.getSchemas();
//     const schema = (schemas as any)[functionName];

//     if (!schema)
//       throw new Error(`Method ${String(functionName)} does not have a schema`);

//     return this.query()
//       .input(schema)
//       .handler(async (context, input) => {
//         const service = new clazz(context.db as unknown as DatabaseReader);
//         return await (service as any)[functionName](input);
//       }) as unknown as ConvexBuilderWithHandler<
//       TDataModel,
//       "query",
//       // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Required for ConvexBuilderWithHandler type
//       {},
//       ExtractSchema<Method>,
//       undefined,
//       Return
//     >;
//   }
// }

// export const listQueryFluentExtended = createBuilder<DataModel>()
//   .extend(MyExtendedQueryBuilder)
//   .fromService(ExperimentsService, "list")
//   .public();
