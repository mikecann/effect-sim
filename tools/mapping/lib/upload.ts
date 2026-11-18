import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MappingView } from "../../../convex/schema";
import type { Decoded, RunManifest } from "./manifest";

/** What upload needs from Convex (ConvexMapping, or a fake in tests). */
export interface ViewStore {
  get(sessionId: string): Promise<{ state: { kind: string } } | null>;
  uploadFile(path: string, contentType: string): Promise<string>;
  addView(sessionId: string, view: MappingView): Promise<unknown>;
  deleteUnattached(storageIds: string[]): Promise<unknown>;
}

const acceptsViews = new Set(["capturing", "solving"]);

/**
 * Puts one run's view into a session: checks the session takes views before
 * uploading anything, and deletes the uploaded photos again if attaching them
 * fails, so nothing is left in storage that no view holds.
 */
export const uploadView = async (
  store: ViewStore,
  args: {
    runDir: string;
    sessionId: string;
    manifest: RunManifest;
    decoded: Decoded;
  },
) => {
  const { runDir, sessionId, manifest, decoded } = args;
  const session = await store.get(sessionId);
  if (!session || !acceptsViews.has(session.state.kind))
    throw new Error(
      `Session ${sessionId} is ${session?.state.kind ?? "gone"}; views go in while it's capturing or solving. Start or join a session and pass --session <id>.`,
    );
  const reference = existsSync(join(runDir, "reference.jpg"))
    ? "reference.jpg"
    : "all.jpg";
  const uploaded: string[] = [];
  try {
    const photo = await store.uploadFile(join(runDir, reference), "image/jpeg");
    uploaded.push(photo);
    const darkPhoto = existsSync(join(runDir, "dark.jpg"))
      ? await store.uploadFile(join(runDir, "dark.jpg"), "image/jpeg")
      : undefined;
    if (darkPhoto) uploaded.push(darkPhoto);
    await store.addView(sessionId, {
      name: manifest.view,
      uploadedAt: Date.now(),
      photo: photo as Id<"_storage">,
      ...(darkPhoto ? { darkPhoto: darkPhoto as Id<"_storage"> } : {}),
      imageWidth: decoded.imageWidth,
      imageHeight: decoded.imageHeight,
      strings: decoded.strings.map((s) => ({
        nodeKey: s.key,
        points: s.points,
      })),
    });
  } catch (e) {
    if (uploaded.length)
      await store.deleteUnattached(uploaded).catch(() => {
        // The daily clean-up (convex/crons.ts) gets them if this fails too.
      });
    throw e;
  }
  return { reference };
};
