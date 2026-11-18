import { makeAutoObservable } from "mobx";
import type { Icon } from "./types";
import { ProjectModel } from "./ProjectModel";
import type { NodeDocOfKind } from "./docs";
import { exposeDocFields, WithAutoSetters } from "./modelUtils";

export interface SwitchNodeModel
  extends WithAutoSetters<NodeDocOfKind<"switch">> {}

export class SwitchNodeModel {
  /**
   * The plug's power as this process last saw it (null: not known). The
   * shared, reported state is the switchStates row (convex/switchState.ts),
   * which the project's switchReporter keeps up to date.
   */
  isOn: boolean | null = null;

  constructor(
    public doc: NodeDocOfKind<"switch">,
    public readonly project: ProjectModel,
  ) {
    makeAutoObservable(this);
    exposeDocFields(this);
  }

  setIsOn(isOn: boolean | null) {
    this.isOn = isOn;
  }

  update({
    name,
    icon,
    ipAddress,
    apiType,
  }: {
    name?: string;
    icon?: Icon;
    ipAddress?: string;
    apiType?: "athom_type1" | "athom_type2";
  }) {
    if (name !== undefined) this.setName(name);
    if (icon !== undefined) this.setIcon(icon);
    if (ipAddress !== undefined) this.setIpAddress(ipAddress);
    if (apiType !== undefined) this.setApiType(apiType);
  }

  remove() {
    if (!this.project) return;
    this.project.removeNode(this);
  }

  get baseUrl() {
    const ip = this.ipAddress;
    const type = this.apiType ?? "athom_type1";
    if (type === "athom_type2") return `http://${ip}/switch/switch`;
    return `http://${ip}/switch/smart_plug_v2`;
  }

  private get reporter() {
    return this.project.switchReporter;
  }

  /** Sends `action` to the plug, reporting the attempt and its answer. */
  private async switchTo(on: boolean, action: "turn_on" | "turn_off" | "toggle") {
    if (import.meta.env.VITE_IS_DEV_MODE) {
      this.setIsOn(on);
      return;
    }

    this.reporter?.switching(this.key, on);
    try {
      const response = await fetch(`${this.baseUrl}/${action}`, {
        method: "POST",
      });
      if (!response.ok)
        throw new Error(
          `Failed to ${action.replace("_", " ")} switch at ${this.ipAddress}: ${response.statusText}`,
        );
    } catch (error) {
      this.reporter?.failed(this.key, String(error));
      throw error;
    }
    this.setIsOn(on);
    this.reporter?.turned(this.key, on);
  }

  async turnOn() {
    await this.switchTo(true, "turn_on");
  }

  async turnOff() {
    await this.switchTo(false, "turn_off");
  }

  async toggle() {
    await this.switchTo(this.isOn === null ? true : !this.isOn, "toggle");
  }

  async refreshStatus() {
    if (import.meta.env.VITE_IS_DEV_MODE)
      // In dev mode, don't fetch - just keep current status
      return;

    // For type2, assuming /switch/switch/ or similar returns JSON with state
    // This might need adjustment if type2 has a different status endpoint
    const url = `${this.baseUrl}/`;

    let isOn: boolean;
    try {
      const response = await fetch(url, { method: "GET" });
      if (!response.ok)
        throw new Error(
          `Failed to refresh switch status at ${this.ipAddress}: ${response.statusText}`,
        );
      const data = await response.json();
      isOn = data?.state === "on" || data?.on === true;
    } catch (error) {
      this.reporter?.failed(this.key, String(error));
      throw error;
    }

    this.setIsOn(isOn);
    this.reporter?.turned(this.key, isOn);
  }
}
