/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import type {
  IJsonModel} from "flexlayout-react";
import {
  Model,
  Action,
  Actions,
  DockLocation,
} from "flexlayout-react";
import { defaultLayoutJson } from "./tabs";

type FlexLayoutContextType = {
  model: Model;
  onModelChange: (model: Model) => void;
  resetLayout: () => void;
  showInspector: () => void;
  showSequencer: () => void;
  showPlaylists: () => void;
};

const FlexLayoutContext = createContext<FlexLayoutContextType | null>(null);

export const INSPECTOR_TAB_ID = "tab-inspector";
export const STRINGS_TAB_ID = "tab-strings";
export const SEQUENCER_TAB_ID = "tab-sequencer";
export const PLAYLISTS_TAB_ID = "tab-playlists";

type FlexLayoutProviderProps = {
  children: ReactNode;
  storageKey: string;
};

export function FlexLayoutProvider({
  children,
  storageKey,
}: FlexLayoutProviderProps) {
  const [model, setModel] = useState<Model>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as IJsonModel;
        return Model.fromJson(parsed);
      }
    } catch (err) {
      console.warn("Failed to load saved layout, using default", err);
    }
    return Model.fromJson(defaultLayoutJson);
  });

  return (
    <FlexLayoutContext.Provider
      value={{
        model,
        onModelChange: (nextModel) => {
          setModel(nextModel);
          try {
            localStorage.setItem(
              storageKey,
              JSON.stringify(nextModel.toJson()),
            );
          } catch (err) {
            console.warn("Failed to persist layout", err);
          }
        },
        resetLayout: () => {
          const fresh = Model.fromJson(defaultLayoutJson);
          setModel(fresh);
          try {
            localStorage.setItem(storageKey, JSON.stringify(fresh.toJson()));
          } catch (err) {
            console.warn("Failed to reset layout", err);
          }
        },
        showInspector: () => {
          // Look for existing inspector tab
          const inspectorTab = model.getNodeById(INSPECTOR_TAB_ID);
          console.log(`inspectorTab`, inspectorTab);

          if (inspectorTab)
            return model.doAction(Actions.selectTab(INSPECTOR_TAB_ID));

          const editorTabset = model.getNodeById(STRINGS_TAB_ID)?.getParent();
          console.log(`editorTabset`, editorTabset);

          if (!editorTabset) return;

          model.doAction(
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
        },
        showSequencer: () => {
          const existing = model.getNodeById(SEQUENCER_TAB_ID);
          if (existing)
            return model.doAction(Actions.selectTab(SEQUENCER_TAB_ID));

          model.doAction(
            Actions.addNode(
              {
                type: "tab",
                name: "Sequencer",
                id: SEQUENCER_TAB_ID,
                component: "sequencer",
                enableClose: true,
              },
              model.getRoot().getId(),
              DockLocation.BOTTOM,
              1,
            ),
          );
        },
        showPlaylists: () => {
          const existing = model.getNodeById(PLAYLISTS_TAB_ID);
          if (existing)
            return model.doAction(Actions.selectTab(PLAYLISTS_TAB_ID));

          // Find the nodes tab to get its parent tabset
          const nodesTab = model.getNodeById("tab-nodes");
          const nodesTabset = nodesTab?.getParent();

          if (!nodesTabset) return;

          model.doAction(
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
        },
      }}
    >
      {children}
    </FlexLayoutContext.Provider>
  );
}

export function useFlexLayout(): FlexLayoutContextType {
  const context = useContext(FlexLayoutContext);
  if (!context) 
    throw new Error("useFlexLayout must be used within a FlexLayoutProvider");
  
  return context;
}
