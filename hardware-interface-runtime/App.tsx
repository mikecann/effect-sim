import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { NodeDocOfKind } from "../convex/schema";
import { ClientDataSocket } from "./ClientDataSocket";
import { String } from "./String";

export function App({ projectId }: { projectId: Id<"projects"> }) {
  const strings = useQuery(api.model.listStringsForProject, {
    projectId,
  });
  return (
    <>
      {strings?.map((string) => (
        <String key={string._id} string={string as NodeDocOfKind<"string">} />
      ))}
      <ClientDataSocket />
    </>
  );
}
