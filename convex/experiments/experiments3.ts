// /* eslint-disable @typescript-eslint/no-explicit-any -- this is experimental code */
// import { v } from "convex/values";
// import { query, type DatabaseReader } from "./_generated/server";
// import type { ObjectType, PropertyValidators } from "convex/values";
// import { createBuilder } from "fluent-convex";
// import { DataModel } from "./_generated/dataModel";
// import {
//   ConvexBuilderWithFunctionKind,
//   ConvexBuilderWithHandler,
//   ConvexArgsValidator,
//   ConvexReturnsValidator,
//   Context,
//   FunctionType,
//   GenericDataModel,
// } from "fluent-convex";

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

// // Factory function to create queries from service methods
// function queryFromService<
//   TServiceClass extends typeof ServiceBase & {
//     new (db: DatabaseReader): InstanceType<TServiceClass>;
//   },
//   TMethodName extends MethodsWithSchemas<InstanceType<TServiceClass>>,
// >(ServiceClass: TServiceClass, methodName: TMethodName) {
//   type ServiceInstance = InstanceType<TServiceClass>;
//   type Method = ServiceInstance[TMethodName];
//   type Args = Method extends (args: infer A) => any ? A : never;
//   type Return = Method extends (args: any) => infer R
//     ? R extends Promise<infer P>
//       ? P
//       : R
//     : never;

//   const schemas = ServiceClass.getSchemas();
//   const schema = (schemas as any)[methodName];

//   if (!schema)
//     throw new Error(`Method ${String(methodName)} does not have a schema`);

//   return query({
//     args: schema,
//     handler: async (context, input: Args): Promise<Return> => {
//       const service = new ServiceClass(context.db);
//       return await (service as any)[methodName](input);
//     },
//   });
// }

// // Factory function to create all queries from a service
// function queriesFromService<
//   TServiceClass extends typeof ServiceBase & {
//     new (db: DatabaseReader): InstanceType<TServiceClass>;
//   },
// >(ServiceClass: TServiceClass) {
//   const schemas = ServiceClass.getSchemas();
//   const queries = {} as any;

//   for (const methodName of Object.keys(schemas))
//     queries[methodName] = queryFromService(
//       ServiceClass,
//       methodName as MethodsWithSchemas<InstanceType<TServiceClass>>,
//     );

//   return queries as {
//     [K in MethodsWithSchemas<InstanceType<TServiceClass>>]: ReturnType<
//       typeof queryFromService<TServiceClass, K>
//     >;
//   };
// }

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

// export const listQueryFromService = queryFromService(
//   ExperimentsService,
//   "list",
// );

// export const listQueryRaw = query({
//   args: ExperimentsService.getSchemas().list,
//   handler: async (context, input) => {
//     const service = new ExperimentsService(context.db);
//     return await service.list(input);
//   },
// });

// const serviceMiddleware = createBuilder<DataModel>()
//   .query()
//   .middleware(async ({ db, ...context }, next) => {
//     const service = new ExperimentsService(db);
//     return next({
//       ...context,
//       db,
//       service,
//     });
//   });

// // Extract schema type from a service method
// type ExtractSchema<TMethod> = TMethod extends { schema: infer TSchema }
//   ? TSchema extends PropertyValidators
//     ? TSchema
//     : never
//   : never;

// class MyExtendedBuilder<
//   TDataModel extends GenericDataModel = GenericDataModel,
//   TFunctionType extends FunctionType = FunctionType,
//   TCurrentContext extends Context & {
//     service: ExperimentsService;
//   } = Context & { service: ExperimentsService },
//   TArgsValidator extends ConvexArgsValidator | undefined = undefined,
//   TReturnsValidator extends ConvexReturnsValidator | undefined = undefined,
// > extends ConvexBuilderWithFunctionKind<
//   TDataModel,
//   TFunctionType,
//   TCurrentContext,
//   TArgsValidator,
//   TReturnsValidator
// > {
//   constructor(
//     builder: ConvexBuilderWithFunctionKind<
//       TDataModel,
//       TFunctionType,
//       TCurrentContext,
//       TArgsValidator,
//       TReturnsValidator
//     >,
//   ) {
//     super(builder.def);
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

//     const schemas = clazz.getSchemas();
//     const schema = (schemas as any)[functionName];

//     if (!schema)
//       throw new Error(`Method ${String(functionName)} does not have a schema`);

//     return this.input(schema).handler(async (context, input: Args) => {
//       return await (context.service as any)[functionName](input);
//     }) as unknown as ConvexBuilderWithHandler<
//       TDataModel,
//       TFunctionType,
//       TCurrentContext,
//       ExtractSchema<Method>,
//       TReturnsValidator,
//       Return
//     >;
//   }
// }

// export const listQueryFluent = createBuilder<DataModel>()
//   .query()
//   .use(serviceMiddleware)
//   .input(ExperimentsService.getSchemas().list)
//   .handler((context, input) => context.service.list(input))
//   .public();

// export const listQueryFluentExtended = createBuilder<DataModel>()
//   .query()
//   .use(serviceMiddleware)
//   .extend(MyExtendedBuilder)
//   .fromService(ExperimentsService, "list")
//   .public();

// export const { list, listWithLimit } = queriesFromService(ExperimentsService);
