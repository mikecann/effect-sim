import { makeAutoObservable } from "mobx";
import type { StringNodeModel } from "../../../shared/models/StringNodeModel";
import type { StringLayout } from "../../../shared/geometry/stringLayout";
import type { SimulatorUIModel } from "./SimulatorUIModel";

/** LEDs a selected virtual string covers: white, or yellow for its selected segment. */
export type LedHighlights = {
  white: ReadonlySet<number>;
  yellow: ReadonlySet<number>;
};

const noHighlights: LedHighlights = { white: new Set(), yellow: new Set() };

/** How the simulator shows one string. One per string, kept while the string is. */
export class StringUIModel {
  constructor(
    public readonly string: StringNodeModel,
    public readonly simulator: SimulatorUIModel,
  ) {
    makeAutoObservable(this, { string: false, simulator: false });
  }

  get key() {
    return this.string.key;
  }

  get layout(): StringLayout {
    return this.string.layout;
  }

  get lightsOnTop(): boolean {
    return this.string.project?.settings.lightsOnTop ?? true;
  }

  get ledSize(): number {
    return this.string.project?.settings.stringLedSize ?? 0.1;
  }

  get isSelected(): boolean {
    return this.simulator.app.selectedNodeIds.includes(this.key);
  }

  /** The LEDs on this string that selected virtual strings use. */
  get highlights(): LedHighlights {
    const app = this.simulator.app;
    const selected = app.selectedEntity;
    if (!selected) return noHighlights;

    const white = new Set<number>();
    const yellow = new Set<number>();
    const add = (set: Set<number>, from: number, to: number) => {
      for (let i = from; i <= to; i++) set.add(i);
    };

    if (selected.kind === "virtual_string") {
      selected.node.segments.forEach((segment, index) => {
        if (segment.nodeId !== this.key) return;
        const isSelectedSegment = selected.selectedSegmentIndex === index;
        add(
          isSelectedSegment ? yellow : white,
          segment.fromIndex,
          segment.toIndex,
        );
      });
      return { white, yellow };
    }

    for (const node of app.selectedNodes)
      if (node.kind === "virtual_string")
        for (const segment of node.segments)
          if (segment.nodeId === this.key)
            add(white, segment.fromIndex, segment.toIndex);

    return { white, yellow };
  }
}
