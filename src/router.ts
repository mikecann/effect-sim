import { createRouter, defineRoute } from "type-route";

export const { RouteProvider, useRoute, routes } = createRouter({
  //home: defineRoute("/"),
  simulator: defineRoute("/"),
});
