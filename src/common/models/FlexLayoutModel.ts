import { makeAutoObservable, observable } from "mobx";
import type {
  IJsonModel,
  IJsonRowNode,
  IJsonTabSetNode,
  IJsonTabNode,
} from "flexlayout-react";
import { Model, Actions, DockLocation } from "flexlayout-react";
import { defaultLayoutJson, TabComponentKinds } from "../tabs";
import { AppModel } from "./AppModel";

export const INSPECTOR_TAB_ID = "tab-inspector";
export const STRINGS_TAB_ID = "tab-strings";
export const SEQUENCER_TAB_ID = "tab-sequencer";
export const PLAYLISTS_TAB_ID = "tab-playlists";

export class FlexLayoutModel {
  model: Model;
  modelJson: IJsonModel | null = null;

  constructor(app: AppModel) {
    this.model = Model.fromJson(
      app.persistedData.flex?.model
        ? app.persistedData.flex?.model
        : defaultLayoutJson,
    );
    this.modelJson = this.model.toJson();
    makeAutoObservable(this, {
      model: observable.ref,
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
    console.log("FlexLayoutModel changed", json);
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
        this.model.getRoot().getId(),
        DockLocation.BOTTOM,
        1,
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
