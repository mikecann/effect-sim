// import { v } from "convex/values";
// import { query, type DatabaseReader } from "./_generated/server";
// import type { ObjectType, PropertyValidators } from "convex/values";
// import { convex } from "./lib";
// import { createReaderServices } from "./common/services";
// import {
//   ConvexBuilderWithFunctionKind,
//   ConvexBuilderWithHandler,
//   ConvexArgsValidator,
//   ConvexReturnsValidator,
//   Context,
//   EmptyObject,
//   FunctionType,
//   GenericDataModel,
//   InferArgs,
// } from "fluent-convex";
// import { api } from "./_generated/api";

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

// class ExperimentsService {
//   constructor(private readonly db: DatabaseReader) {}

//   list = builder.input({}).handler(({}) => this.db.query("nodes").collect());

//   listWithLimit = builder
//     .input({ limit: v.number() })
//     .handler(async ({ limit }) => {
//       const nodes = await this.list({});
//       if (nodes.length > limit) throw new Error("Limit exceeded");
//       return nodes;
//     });

//   static get schemas() {
//     const temp = new ExperimentsService({} as DatabaseReader);
//     return {
//       list: temp.list.schema,
//       listWithLimit: temp.listWithLimit.schema,
//     };
//   }
// }

// //const xx = ExperimentsService.prototype.listWithLimit.schema;

// const service = new ExperimentsService({} as DatabaseReader);
// // service.listWithLimit({ limit: 123 });

// // const serviceMiddleware = convex
// //   .query()
// //   .middleware(async ({ db, ...context }, next) => {
// //     const service = new ExperimentsService(db);
// //     return next({
// //       ...context,
// //       db,
// //       service,
// //     });
// //   });

// // // Type helper to extract service methods that have a schema property
// // type ServiceMethodWithSchema = {
// //   [K in keyof ExperimentsService]: ExperimentsService[K] extends {
// //     schema: PropertyValidators;
// //   }
// //     ? ExperimentsService[K] extends (args: infer TArgs) => infer TReturn
// //       ? {
// //           schema: PropertyValidators;
// //           (args: TArgs): TReturn | Promise<TReturn>;
// //         }
// //       : never
// //     : never;
// // }[keyof ExperimentsService];

// // // Extract schema type from a service method
// // type ExtractSchema<TMethod> = TMethod extends { schema: infer TSchema }
// //   ? TSchema extends PropertyValidators
// //     ? TSchema
// //     : never
// //   : never;

// // // Extract input type from a service method
// // type ExtractInput<TMethod> = TMethod extends (args: infer TArgs) => unknown
// //   ? TArgs
// //   : never;

// // // Extract return type from a service method (unwrap Promise if present)
// // type ExtractReturn<TMethod> = TMethod extends (...args: any[]) => infer TReturn
// //   ? TReturn extends Promise<infer TResolved>
// //     ? TResolved
// //     : TReturn
// //   : never;

// // // Helper type for callable builder (not exported from fluent-convex)
// // type LocalInferredArgs<T extends ConvexArgsValidator | undefined> =
// //   T extends ConvexArgsValidator ? InferArgs<T> : EmptyObject;

// // type LocalCallableBuilder<
// //   TCurrentContext extends Context,
// //   TArgsValidator extends ConvexArgsValidator | undefined,
// //   THandlerReturn,
// // > = {
// //   (
// //     context: TCurrentContext,
// //   ): (args: LocalInferredArgs<TArgsValidator>) => Promise<THandlerReturn>;
// // };

// // class MyExtendedBuilder<
// //   TDataModel extends GenericDataModel = GenericDataModel,
// //   TFunctionType extends FunctionType = FunctionType,
// //   TCurrentContext extends Context & {
// //     service: ExperimentsService;
// //   } = Context & { service: ExperimentsService },
// //   TArgsValidator extends ConvexArgsValidator | undefined = undefined,
// //   TReturnsValidator extends ConvexReturnsValidator | undefined = undefined,
// // > extends ConvexBuilderWithFunctionKind<
// //   TDataModel,
// //   TFunctionType,
// //   TCurrentContext,
// //   TArgsValidator,
// //   TReturnsValidator
// // > {
// //   constructor(
// //     builder: ConvexBuilderWithFunctionKind<
// //       TDataModel,
// //       TFunctionType,
// //       TCurrentContext,
// //       TArgsValidator,
// //       TReturnsValidator
// //     >,
// //   ) {
// //     super(builder.def);
// //   }

// //   // A custom method that modifies the builder state and RE-WRAPS it
// //   fromService<TMethod extends ServiceMethodWithSchema>(
// //     fn: (service: ExperimentsService) => TMethod,
// //   ) {
// //     console.log("service", service);

// //     return query({
// //       args: service.list.schema,
// //       handler: async (context, input) => {
// //         return await service.list(input);
// //       },
// //     });
// //   }

// //   const serviceFunction = fn(service);
// //   const schema = serviceFunction.schema;

// //   console.log("SCHEMA", schema);

// //   const builder = this.input(schema).handler(async (context, input) => {
// //     return (await serviceFunction(input as any)) as any;
// //   });

// //   // Manually cast the result to the correct type, restoring the return type info
// //   return builder as unknown as ConvexBuilderWithHandler<
// //     TDataModel,
// //     TFunctionType,
// //     TCurrentContext,
// //     ExtractSchema<TMethod>,
// //     TReturnsValidator,
// //     ExtractReturn<TMethod>
// //   > &
// //     LocalCallableBuilder<
// //       TCurrentContext,
// //       ExtractSchema<TMethod>,
// //       ExtractReturn<TMethod>
// //     >;
// // }
// //}

// export const listQueryRaw = query({
//   args: ExperimentsService.schemas.list,
//   handler: async (context, input) => {
//     const actualService = new ExperimentsService(context.db);
//     return await actualService.list(input);
//   },
// });

// // export const listQuery = convex
// //   .query()
// //   .use(serviceMiddleware)
// //   .extend((builder) => new MyExtendedBuilder(builder))
// //   .fromService((service) => service.list)
// //.public();

// // const fakeService = new ExperimentsService({} as DatabaseReader);

// // export const listQuery = convex
// //   .query()
// //   //.use(serviceMiddleware)
// //   //.extend((builder) => new MyExtendedBuilder(builder))
// //   //.fromService((service) => service.list)
// //   .use(serviceMiddleware)
// //   .input(fakeService.list.schema)
// //   .handler((context, input) => context.service.list(input))
// //   .public();

// // export const listWithLimitQuery = convex
// //   .query()
// //   .use(serviceMiddleware)
// //   //.extend((builder) => new MyExtendedBuilder(builder))
// //   .input(ExperimentsService.prototype.listWithLimit.schema)
// //   .handler((context, input) => context.service.listWithLimit(input))
// //   .public();
