import { makeAutoObservable } from "mobx";
import { Doc, Id, TableNames } from "../../convex/_generated/dataModel";
import { NodeDocOfKind } from "../../convex/schema";
import { PlaylistModel } from "./PlaylistModel";
import { SequenceModel } from "./sequencer/SequenceModel";
import { StringNodeModel } from "./StringNodeModel";
import { SwitchNodeModel } from "./SwitchNodeModel";
import { VirtualStringNodeModel } from "./VirtualStringNodeModel";
import { FolderNodeModel } from "./FolderNodeModel";
import type { AllNodeModels } from "./types";
import { createTempId } from "./types";
import type { Segment } from "./types";
import type { PathPoint } from "./types";
import { ensure } from "../ensure";
import { ProjectData } from "../../convex/model";
import { exhaustiveCheck } from "../misc";

export class ProjectModel {
  playlists: PlaylistModel[] = [];
  sequences: SequenceModel[] = [];
  nodes: AllNodeModels[] = [];

  constructor(public doc: Doc<"projects">) {
    makeAutoObservable(this);
  }

  get _id() {
    return this.doc._id;
  }

  get name() {
    return this.doc.name;
  }

  get settings() {
    return this.doc.settings;
  }

  get modelsByTableNameIds() {
    return {
      projects: new Set([this._id]),
      playlists: new Set(this.playlists.map((playlist) => playlist._id)),
      nodes: new Set(this.nodes.map((node) => node._id)),
      sequences: new Set(this.sequences.map((sequence) => sequence._id)),
    };
  }

  getModelListByTableName<TableName extends TableNames>(tableName: TableName) {
    if (tableName === "projects") return [this];
    if (tableName === "playlists") return this.playlists;
    if (tableName === "nodes") return this.nodes;
    if (tableName === "sequences") return this.sequences;
    return [];
  }

  findModel<TableName extends TableNames>(
    tableName: TableName,
    id: Id<TableName>,
  ) {
    const list = this.getModelListByTableName(tableName);
    if (!list) return null;
    return list.find((model) => model._id === id) ?? null;
  }

  getModel<TableName extends TableNames>(
    tableName: TableName,
    id: Id<TableName>,
  ) {
    return ensure(
      this.findModel(tableName, id),
      `Model ${tableName} with id '${id}' could not be found`,
    );
  }

  findNodes(ids: Id<"nodes">[]): AllNodeModels[] {
    return ids
      .map((id) => this.findModel("nodes", id))
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

  setName(name: string) {
    this.doc.name = name;
  }

  updateSettings(settings: {
    nightMode?: boolean;
    lightsOnTop?: boolean;
    stringLedSize?: number;
    cameraControl?: "orbit" | "fly" | "first_person";
    defaultFramerate?: number;
  }) {
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

  removeNode(node: AllNodeModels) {
    const index = this.nodes.indexOf(node);
    if (index >= 0) this.nodes.splice(index, 1);
  }

  duplicateNode(id: Id<"nodes">): AllNodeModels {
    const original = this.nodes.find((n) => n._id === id);
    if (!original)
      throw new Error(
        `Node with id '${id}' could not be duplicated because it does not exist`,
      );

    const doc = original.doc;
    const newDoc = {
      ...doc,
      _id: createTempId("nodes"),
      _creationTime: Date.now(),
      order: (doc.order ?? 0) + 0.5, // Place after original
    } as Doc<"nodes">;

    const kind = original.kind;
    if (kind === "string")
      return this.addAndReturn(
        new StringNodeModel(
          newDoc as Extract<Doc<"nodes">, { kind: "string" }>,
          this,
        ),
      );
    if (kind === "folder")
      return this.addAndReturn(
        new FolderNodeModel(
          newDoc as Extract<Doc<"nodes">, { kind: "folder" }>,
          this,
        ),
      );
    if (kind === "switch")
      return this.addAndReturn(
        new SwitchNodeModel(
          newDoc as Extract<Doc<"nodes">, { kind: "switch" }>,
          this,
        ),
      );
    if (kind === "virtual_string")
      return this.addAndReturn(
        new VirtualStringNodeModel(
          newDoc as Extract<Doc<"nodes">, { kind: "virtual_string" }>,
          this,
        ),
      );
    exhaustiveCheck(kind);
  }

  private addAndReturn<T extends AllNodeModels>(node: T): T {
    this.addNode(node);
    return node;
  }

  applyNodePatches(
    patches: Array<{
      _id: Id<"nodes">;
      parentId?: Id<"nodes"> | null;
      order?: number;
    }>,
  ) {
    for (const patch of patches) {
      const node = this.nodes.find((n) => n._id === patch._id);
      if (!node) continue;

      // All node models have these properties
      if (patch.parentId !== undefined) node.doc.parentId = patch.parentId;
      if (patch.order !== undefined) node.doc.order = patch.order;
    }
  }

  private getMaxOrderForParent(parentId: Id<"nodes"> | null): number {
    const siblings = this.nodes.filter((node) => node.parentId === parentId);
    return siblings.reduce((max, node) => Math.max(max, node.order ?? 0), 0);
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
    parentId?: Id<"nodes"> | null;
    spacingMeters?: number;
    ledCount?: number;
    ipAddress?: string;
    port?: number;
    brightness?: number;
    pathPoints?: PathPoint[];
  } = {}) {
    const order = this.getMaxOrderForParent(parentId) + 1;

    const existingStrings = this.nodes.filter((node) => node.kind === "string");
    const stringCount = existingStrings.length;
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
    const iconEmoji = numberEmojis[stringCount % numberEmojis.length] ?? "1️⃣";

    const node = new StringNodeModel(
      {
        _id: createTempId("nodes"),
        _creationTime: Date.now(),
        projectId: this._id,
        parentId,
        order,
        kind: "string",
        name: name ?? "New String",
        icon: { kind: "emoji", emoji: iconEmoji },
        spacingMeters,
        ledCount,
        ipAddress,
        port,
        brightness,
        pathPoints,
      } as Extract<Doc<"nodes">, { kind: "string" }>,
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
    parentId?: Id<"nodes"> | null;
    ipAddress?: string;
    apiType?: "athom_type1" | "athom_type2";
  } = {}) {
    const order = this.getMaxOrderForParent(parentId) + 1;

    const existingSwitches = this.nodes.filter(
      (node) => node.kind === "switch",
    );
    const switchCount = existingSwitches.length;
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
    const iconEmoji = numberEmojis[switchCount % numberEmojis.length] ?? "1️⃣";

    const node = new SwitchNodeModel(
      {
        _id: createTempId("nodes"),
        _creationTime: Date.now(),
        projectId: this._id,
        parentId,
        order,
        kind: "switch",
        name: name ?? "New Switch",
        icon: { kind: "emoji", emoji: iconEmoji },
        ipAddress,
        isOn: null,
        apiType,
      } as Extract<Doc<"nodes">, { kind: "switch" }>,
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
    parentId?: Id<"nodes"> | null;
    segments?: Segment[];
  } = {}) {
    const order = this.getMaxOrderForParent(parentId) + 1;

    const existingVirtualStrings = this.nodes.filter(
      (node) => node.kind === "virtual_string",
    );
    const virtualStringCount = existingVirtualStrings.length;
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
    const iconEmoji =
      letterEmojis[virtualStringCount % letterEmojis.length] ?? "🅰️";

    const node = new VirtualStringNodeModel(
      {
        _id: createTempId("nodes"),
        _creationTime: Date.now(),
        projectId: this._id,
        parentId,
        order,
        kind: "virtual_string",
        name: name ?? "New Virtual String",
        icon: { kind: "emoji", emoji: iconEmoji },
        segments,
      } as Extract<Doc<"nodes">, { kind: "virtual_string" }>,
      this,
    );

    this.addNode(node);
    return node;
  }

  createFolderNode({
    label,
    parentId = null,
    children = [],
  }: {
    label: string;
    parentId?: Id<"nodes"> | null;
    children?: Id<"nodes">[];
  }) {
    const order = this.getMaxOrderForParent(parentId) + 1;

    const node = new FolderNodeModel(
      {
        _id: createTempId("nodes"),
        _creationTime: Date.now(),
        projectId: this._id,
        parentId,
        order,
        kind: "folder",
        label,
        children,
      } as Extract<Doc<"nodes">, { kind: "folder" }>,
      this,
    );

    this.addNode(node);
    return node;
  }

  updateFromServerData({ nodes, playlists, sequences }: ProjectData) {
    this.playlists = this.reconcileModels(
      this.playlists,
      playlists,
      (doc) => new PlaylistModel(doc, this),
    );

    this.sequences = this.reconcileModels(
      this.sequences,
      sequences,
      (doc) => new SequenceModel(doc, this),
    );

    this.nodes = this.reconcileModels(
      this.nodes,
      nodes,
      (doc) => this.createNodeModel(doc),
      (model, doc) => model.kind === doc.kind,
    );
  }

  private reconcileModels<
    Model extends { _id: string; doc: unknown },
    Doc extends { _id: string },
  >(
    currentModels: Model[],
    newDocs: Doc[],
    createModel: (doc: Doc) => Model,
    canReuseModel: (model: Model, doc: Doc) => boolean = () => true,
  ): Model[] {
    const nextModels: Model[] = [];
    for (const doc of newDocs) {
      const existing = currentModels.find((m) => m._id === doc._id);
      if (existing && canReuseModel(existing, doc)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (existing as any).doc = doc;
        nextModels.push(existing);
      } else nextModels.push(createModel(doc));
    }
    return nextModels;
  }

  createNodeModel(doc: Doc<"nodes">): AllNodeModels {
    if (doc.kind === "string")
      return new StringNodeModel(
        doc as Extract<Doc<"nodes">, { kind: "string" }>,
        this,
      );
    if (doc.kind === "folder")
      return new FolderNodeModel(
        doc as Extract<Doc<"nodes">, { kind: "folder" }>,
        this,
      );
    if (doc.kind === "switch")
      return new SwitchNodeModel(
        doc as Extract<Doc<"nodes">, { kind: "switch" }>,
        this,
      );
    if (doc.kind === "virtual_string")
      return new VirtualStringNodeModel(
        doc as Extract<Doc<"nodes">, { kind: "virtual_string" }>,
        this,
      );
    exhaustiveCheck(doc);
  }
}
