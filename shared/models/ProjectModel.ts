import { makeAutoObservable } from "mobx";
import type { Doc } from "../../convex/_generated/dataModel";
import { PlaylistModel } from "./PlaylistModel";
import { SequenceModel } from "./sequencer/SequenceModel";
import { StringNodeModel } from "./StringNodeModel";
import { SwitchNodeModel } from "./SwitchNodeModel";
import { VirtualStringNodeModel } from "./VirtualStringNodeModel";
import { FolderNodeModel } from "./FolderNodeModel";
import type { AllNodeModels } from "./types";
import type { Segment } from "./types";
import type { PathPoint } from "./types";
import type { ProjectData } from "../../convex/functions";
import { exhaustiveCheck } from "../misc";
import { exposeDocFields, WithAutoSetters } from "./modelUtils";
import {
  newKey,
  toEditorDoc,
  type NodeDoc,
  type NodeDocOfKind,
  type NodeKey,
  type PlaylistDoc,
  type SequenceDoc,
  type SequenceKey,
} from "./docs";

/**
 * Who hears about a switch plug being switched (convex/switches.ts): HWIR and
 * the editor each report to Convex with their own token.
 */
export type SwitchReporter = {
  switching(nodeKey: NodeKey, on: boolean): void;
  turned(nodeKey: NodeKey, on: boolean): void;
  failed(nodeKey: NodeKey, error: string): void;
};

// Interface merging - tells TypeScript that ProjectModel has all the doc fields
export interface ProjectModel extends WithAutoSetters<Doc<"projects">> {}

const numberEmojis = [
  "1️⃣",
  "2️⃣",
  "3️⃣",
  "4️⃣",
  "5️⃣",
  "6️⃣",
  "7️⃣",
  "8️⃣",
  "9️⃣",
  "🔟",
];

const letterEmojis = [
  "🅰️",
  "🅱️",
  "🆎",
  "🆑",
  "🅾️",
  "🆘",
  "⭕",
  "🔴",
  "🟠",
  "🟡",
];

export class ProjectModel {
  playlists: PlaylistModel[] = [];
  sequences: SequenceModel[] = [];
  nodes: AllNodeModels[] = [];
  switchReporter: SwitchReporter | null = null;

  constructor(public doc: Doc<"projects">) {
    makeAutoObservable(this, { switchReporter: false });
    exposeDocFields(this);
  }

  setSwitchReporter(reporter: SwitchReporter | null) {
    this.switchReporter = reporter;
  }

  findNode(key: NodeKey): AllNodeModels | null {
    return this.nodes.find((node) => node.key === key) ?? null;
  }

  findNodes(keys: NodeKey[]): AllNodeModels[] {
    return keys
      .map((key) => this.findNode(key))
      .filter((node): node is AllNodeModels => node !== null);
  }

  getNodesByKind<K extends AllNodeModels["kind"]>(kind: K) {
    return this.nodes.filter(
      (node): node is Extract<AllNodeModels, { kind: K }> => node.kind === kind,
    );
  }

  get strings(): StringNodeModel[] {
    return this.nodes.filter((node) => node instanceof StringNodeModel);
  }

  get stringDocs(): Array<NodeDocOfKind<"string">> {
    return this.strings.map((string) => string.doc);
  }

  get virtualStrings(): VirtualStringNodeModel[] {
    return this.nodes.filter((node) => node instanceof VirtualStringNodeModel);
  }

  addPlaylist(playlist: PlaylistModel) {
    this.playlists.push(playlist);
  }

  addSequence(sequence: SequenceModel) {
    this.sequences.push(sequence);
  }

  addNode(node: AllNodeModels) {
    this.nodes.push(node);
  }

  findSequence(key: SequenceKey): SequenceModel | null {
    return this.sequences.find((s) => s.key === key) ?? null;
  }

  updateSettings(settings: Partial<Doc<"projects">["settings"]>) {
    if (settings.nightMode !== undefined)
      this.settings.nightMode = settings.nightMode;

    if (settings.lightsOnTop !== undefined)
      this.settings.lightsOnTop = settings.lightsOnTop;

    if (settings.stringLedSize !== undefined)
      this.settings.stringLedSize = settings.stringLedSize;

    if (settings.cameraControl !== undefined)
      this.settings.cameraControl = settings.cameraControl;

    if (settings.defaultFramerate !== undefined)
      this.settings.defaultFramerate = settings.defaultFramerate;
  }

  removePlaylist(playlist: PlaylistModel) {
    const index = this.playlists.indexOf(playlist);
    if (index >= 0) this.playlists.splice(index, 1);
  }

  removeSequence(sequence: SequenceModel) {
    const index = this.sequences.indexOf(sequence);
    if (index >= 0) this.sequences.splice(index, 1);
  }

  /**
   * Removes a node. A folder's children move up to its parent, as the
   * server's sync does (convex/editorSync.ts), so the tree doesn't show
   * orphans while the save is on its way.
   */
  removeNode(node: AllNodeModels) {
    const index = this.nodes.indexOf(node);
    if (index < 0) return;
    this.nodes.splice(index, 1);
    for (const child of this.nodes)
      if (child.parentId === node.key) child.setParentId(node.parentId);
  }

  duplicateNode(key: NodeKey): AllNodeModels {
    const original = this.findNode(key);
    if (!original)
      throw new Error(
        `Node with key '${key}' could not be duplicated because it does not exist`,
      );

    const node = this.createNodeModel({
      ...structuredClone(original.doc),
      key: newKey(),
      order: original.order + 0.5, // Place after original
    });
    this.addNode(node);
    return node;
  }

  applyNodePatches(
    patches: Array<{
      key: NodeKey;
      parentId?: NodeKey | null;
      order?: number;
    }>,
  ) {
    for (const patch of patches) {
      const node = this.findNode(patch.key);
      if (!node) continue;
      if (patch.parentId !== undefined) node.setParentId(patch.parentId);
      if (patch.order !== undefined) node.setOrder(patch.order);
    }
  }

  private getMaxOrderForParent(parentId: NodeKey | null): number {
    const siblings = this.nodes.filter((node) => node.parentId === parentId);
    return siblings.reduce((max, node) => Math.max(max, node.order ?? 0), 0);
  }

  private newNodeFields(parentId: NodeKey | null) {
    return {
      key: newKey(),
      projectId: this._id,
      parentId,
      order: this.getMaxOrderForParent(parentId) + 1,
    };
  }

  createStringNode({
    name,
    parentId = null,
    spacingMeters = 0.1,
    ledCount = 100,
    ipAddress = "192.168.1.100",
    port = 21324,
    brightness = 128,
    pathPoints = [],
  }: {
    name?: string;
    parentId?: NodeKey | null;
    spacingMeters?: number;
    ledCount?: number;
    ipAddress?: string;
    port?: number;
    brightness?: number;
    pathPoints?: PathPoint[];
  } = {}) {
    const stringCount = this.getNodesByKind("string").length;
    const node = new StringNodeModel(
      {
        ...this.newNodeFields(parentId),
        kind: "string",
        name: name ?? "New String",
        icon: {
          kind: "emoji",
          emoji: numberEmojis[stringCount % numberEmojis.length] ?? "1️⃣",
        },
        spacingMeters,
        ledCount,
        ipAddress,
        port,
        brightness,
        pathPoints,
      },
      this,
    );
    this.addNode(node);
    return node;
  }

  createSwitchNode({
    name,
    parentId = null,
    ipAddress = "192.168.2.58",
    apiType = "athom_type1",
  }: {
    name?: string;
    parentId?: NodeKey | null;
    ipAddress?: string;
    apiType?: "athom_type1" | "athom_type2";
  } = {}) {
    const switchCount = this.getNodesByKind("switch").length;
    const node = new SwitchNodeModel(
      {
        ...this.newNodeFields(parentId),
        kind: "switch",
        name: name ?? "New Switch",
        icon: {
          kind: "emoji",
          emoji: numberEmojis[switchCount % numberEmojis.length] ?? "1️⃣",
        },
        ipAddress,
        apiType,
      },
      this,
    );
    this.addNode(node);
    return node;
  }

  createVirtualStringNode({
    name,
    parentId = null,
    segments = [],
  }: {
    name?: string;
    parentId?: NodeKey | null;
    segments?: Segment[];
  } = {}) {
    const count = this.getNodesByKind("virtual_string").length;
    const node = new VirtualStringNodeModel(
      {
        ...this.newNodeFields(parentId),
        kind: "virtual_string",
        name: name ?? "New Virtual String",
        icon: {
          kind: "emoji",
          emoji: letterEmojis[count % letterEmojis.length] ?? "🅰️",
        },
        segments,
      },
      this,
    );
    this.addNode(node);
    return node;
  }

  createFolderNode({
    label,
    parentId = null,
  }: {
    label: string;
    parentId?: NodeKey | null;
  }) {
    const node = new FolderNodeModel(
      { ...this.newNodeFields(parentId), kind: "folder", label },
      this,
    );
    this.addNode(node);
    return node;
  }

  /** A new sequence, not yet added to the project. */
  newSequence(fields: { name: string; numFrames: number }): SequenceModel {
    return new SequenceModel(
      { key: newKey(), projectId: this._id, tracks: [], ...fields },
      this,
    );
  }

  /** A new playlist, not yet added to the project. */
  newPlaylist(fields: { name: string }): PlaylistModel {
    return new PlaylistModel(
      { key: newKey(), projectId: this._id, sequenceIds: [], ...fields },
      this,
    );
  }

  /**
   * Replaces the project's rows with the server's, keeping each model whose
   * key (and, for nodes, kind) is unchanged. HWIR, which never edits, uses
   * this; the editor merges with its unsaved edits instead
   * (src/common/models/sync/ProjectSyncModel.ts).
   */
  updateFromServerData({ nodes, playlists, sequences }: ProjectData) {
    this.playlists = this.reconcileModels(
      this.playlists,
      playlists.map(toEditorDoc<"playlists">),
      (doc) => new PlaylistModel(doc, this),
    );
    this.sequences = this.reconcileModels(
      this.sequences,
      sequences.map(toEditorDoc<"sequences">),
      (doc) => new SequenceModel(doc, this),
    );
    this.nodes = this.reconcileModels(
      this.nodes,
      nodes.map(toEditorDoc<"nodes">),
      (doc) => this.createNodeModel(doc),
      (model, doc) => model.kind === doc.kind,
    );
  }

  private reconcileModels<
    Model extends { key: string; doc: unknown },
    D extends { key: string },
  >(
    currentModels: Model[],
    newDocs: D[],
    createModel: (doc: D) => Model,
    canReuseModel: (model: Model, doc: D) => boolean = () => true,
  ): Model[] {
    return newDocs.map((doc) => {
      const existing = currentModels.find((m) => m.key === doc.key);
      if (!existing || !canReuseModel(existing, doc)) return createModel(doc);
      (existing as { doc: unknown }).doc = doc;
      return existing;
    });
  }

  createNodeModel(doc: NodeDoc): AllNodeModels {
    if (doc.kind === "string") return new StringNodeModel(doc, this);
    if (doc.kind === "folder") return new FolderNodeModel(doc, this);
    if (doc.kind === "switch") return new SwitchNodeModel(doc, this);
    if (doc.kind === "virtual_string")
      return new VirtualStringNodeModel(doc, this);
    exhaustiveCheck(doc);
  }

  createSequenceModel(doc: SequenceDoc): SequenceModel {
    return new SequenceModel(doc, this);
  }

  createPlaylistModel(doc: PlaylistDoc): PlaylistModel {
    return new PlaylistModel(doc, this);
  }
}
