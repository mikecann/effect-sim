import type { IJsonModel } from "flexlayout-react";

export const defaultLayoutJson: IJsonModel = {
  global: { splitterSize: 6 },
  borders: [],
  layout: {
    type: "row",
    id: "#9caca87b-9115-4b8d-801b-051959adbd37",
    children: [
      {
        type: "row",
        id: "#f4bf6840-35eb-4542-be6e-dff6c22fbee0",
        children: [
          {
            type: "row",
            id: "#6d4ec271-cbbb-4a97-ae16-ac750a3ee6c2",
            weight: 56.29283083329615,
            children: [
              {
                type: "tabset",
                id: "#75227678-b8b8-4968-82f1-a9998270002c",
                weight: 22.385505169413452,
                children: [
                  {
                    type: "tab",
                    id: "tab-nodes",
                    name: "Nodes",
                    component: "nodes",
                    enableClose: false,
                  },
                  {
                    type: "tab",
                    id: "tab-playlists",
                    name: "Playlists",
                    component: "playlists",
                    enableClose: true,
                  },
                ],
                active: true,
              },
              {
                type: "tabset",
                id: "#7a993503-58f7-43e6-95cc-1054ce674409",
                weight: 55.601596888115466,
                children: [
                  {
                    type: "tab",
                    id: "tab-simulator",
                    name: "Simulator",
                    component: "simulator",
                    enableClose: false,
                  },
                ],
              },
              {
                type: "tabset",
                id: "#16bf6d6f-638d-44a4-aaad-8dbf41f20b5d",
                weight: 22.01289794247108,
                children: [
                  {
                    type: "tab",
                    id: "inspector",
                    name: "Inspector",
                    component: "inspector",
                    enableClose: false,
                  },
                ],
              },
            ],
          },
          {
            type: "tabset",
            id: "#ad88e310-0463-406e-aac4-ed2eb4916d26",
            weight: 43.70716916670385,
            children: [
              {
                type: "tab",
                id: "tab-sequencer",
                name: "Sequencer",
                component: "sequencer",
                enableClose: true,
              },
            ],
          },
        ],
      },
    ],
  },
  popouts: {},
};

export default defaultLayoutJson;
