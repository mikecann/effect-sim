import { makeAutoObservable, observableRef } from "mobx";
import type {
  IJsonModel,
  IJsonRowNode,
  IJsonTabSetNode,
  IJsonTabNode,
} from "flexlayout-react";
import { Model, Actions, DockLocation } from "flexlayout-react";
import { defaultLayoutJson, TabComponentKinds } from "../tabs";
import { AppModel } from "./AppModel";
import { makePersistable } from "mobx-persist-store";
import { ensureNotUndefined } from "../../../shared/ensure";

export const INSPECTOR_TAB_ID = "tab-inspector";
export const STRINGS_TAB_ID = "tab-strings";
export const SEQUENCER_TAB_ID = "tab-sequencer";
export const PLAYLISTS_TAB_ID = "tab-playlists";
export const MAPPING_TAB_ID = "tab-mapping";

export class FlexLayoutModel {
  model: Model;
  modelJson: IJsonModel | null = null;

  constructor(app: AppModel) {
    this.model = Model.fromJson(defaultLayoutJson);
    makeAutoObservable(this, {
      model: observableRef,
    });
    makePersistable(this, {
      name: "FlexLayoutModel",
      properties: ["modelJson"],
      storage: window.localStorage,
    }).then((store) => {
      this.setModel(Model.fromJson(this.modelJson ?? defaultLayoutJson));
    });
  }

  get nodesById() {
    const map = new Map<
      string,
      IJsonRowNode | IJsonTabSetNode | IJsonTabNode
    >();
    if (!this.modelJson) return map;

    const traverse = (node: IJsonRowNode | IJsonTabSetNode | IJsonTabNode) => {
      if (node.id) map.set(node.id, node);
      if ("children" in node && node.children)
        (
          node.children as (IJsonRowNode | IJsonTabSetNode | IJsonTabNode)[]
        ).forEach(traverse);
    };

    traverse(this.modelJson.layout);

    return map;
  }

  get nodesByComponent() {
    const map = new Map<TabComponentKinds, IJsonTabNode[]>();

    for (const node of this.nodesById.values()) {
      if (node.type !== "tab") continue;
      const tabNode = node as IJsonTabNode;
      if (!tabNode.component) continue;

      const list = map.get(tabNode.component as TabComponentKinds) ?? [];
      list.push(tabNode);
      map.set(tabNode.component as TabComponentKinds, list);
    }

    return map;
  }

  setModel(nextModel: Model) {
    this.model = nextModel;
    const json = this.model.toJson();
    this.modelJson = json;
  }

  resetLayout() {
    const fresh = Model.fromJson(defaultLayoutJson);
    this.setModel(fresh);
  }

  showInspector() {
    const inspectorTab = this.model.getNodeById(INSPECTOR_TAB_ID);
    if (inspectorTab)
      return this.model.doAction(Actions.selectTab(INSPECTOR_TAB_ID));

    const editorTabset = this.model.getNodeById(STRINGS_TAB_ID)?.getParent();
    if (!editorTabset) return;

    this.model.doAction(
      Actions.addNode(
        {
          type: "tab",
          name: "Inspector",
          id: INSPECTOR_TAB_ID,
          component: "inspector",
          enableClose: true,
        },
        editorTabset.getId(),
        DockLocation.BOTTOM,
        1,
      ),
    );
  }

  showSequencer() {
    const existing = this.model.getNodeById(SEQUENCER_TAB_ID);
    if (existing)
      return this.model.doAction(Actions.selectTab(SEQUENCER_TAB_ID));

    this.model.doAction(
      Actions.addNode(
        {
          type: "tab",
          name: "Sequencer",
          id: SEQUENCER_TAB_ID,
          component: "sequencer",
          enableClose: true,
        },
        ensureNotUndefined(
          this.model.getRootRow(),
          "flexlayout model has no root row",
        ).getId(),
        DockLocation.BOTTOM,
        1,
      ),
    );
  }

  /** Opens the camera mapping panel beside the inspector. */
  showMapping() {
    if (this.model.getNodeById(MAPPING_TAB_ID))
      return this.model.doAction(Actions.selectTab(MAPPING_TAB_ID));
    const inspector =
      this.model.getNodeById("inspector") ??
      this.model.getNodeById(INSPECTOR_TAB_ID);
    const tabset = inspector?.getParent();
    if (!tabset) return;
    this.model.doAction(
      Actions.addNode(
        {
          type: "tab",
          name: "Mapping",
          id: MAPPING_TAB_ID,
          component: "mapping",
          enableClose: true,
        },
        tabset.getId(),
        DockLocation.CENTER,
        -1,
      ),
    );
  }

  showPlaylists() {
    const existing = this.model.getNodeById(PLAYLISTS_TAB_ID);
    if (existing)
      return this.model.doAction(Actions.selectTab(PLAYLISTS_TAB_ID));

    const nodesTab = this.model.getNodeById("tab-nodes");
    const nodesTabset = nodesTab?.getParent();

    if (!nodesTabset) return;

    this.model.doAction(
      Actions.addNode(
        {
          type: "tab",
          name: "Playlists",
          id: PLAYLISTS_TAB_ID,
          component: "playlists",
          enableClose: true,
        },
        nodesTabset.getId(),
        DockLocation.CENTER,
        -1,
      ),
    );
  }
}
