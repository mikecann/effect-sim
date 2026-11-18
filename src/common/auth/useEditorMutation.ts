import { useMutation } from "convex/react";
import { useCallback } from "react";
import type {
  FunctionArgs,
  FunctionReference,
  OptionalRestArgs,
} from "convex/server";
import { useApp } from "../AppContext";
import { isUnauthorized } from "./EditorTokenModel";

type TokenMutation = FunctionReference<"mutation", "public", { token?: string }>;

/**
 * useMutation for the editor's own mutations: adds the editor token, and asks
 * for it again if the server refuses it.
 */
export const useEditorMutation = <M extends TokenMutation>(mutation: M) => {
  const app = useApp();
  const run = useMutation(mutation);
  return useCallback(
    async (args: Omit<FunctionArgs<M>, "token">) => {
      try {
        const withToken = {
          ...args,
          token: app.editorToken.token ?? undefined,
        } as FunctionArgs<M>;
        return await run(...([withToken] as unknown as OptionalRestArgs<M>));
      } catch (error) {
        if (isUnauthorized(error)) app.editorToken.refused();
        throw error;
      }
    },
    [app, run],
  );
};
