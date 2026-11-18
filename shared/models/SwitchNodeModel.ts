import { makeAutoObservable } from "mobx";
import type { Icon } from "./types";
import { ProjectModel } from "./ProjectModel";
import { NodeDocOfKind } from "../../convex/schema";
import { exposeDocFields, WithAutoSetters } from "./modelUtils";
import { reachOut } from "../outsideWorld";

export interface SwitchNodeModel extends WithAutoSetters<
  NodeDocOfKind<"switch">
> {}

export class SwitchNodeModel {
  constructor(
    public doc: NodeDocOfKind<"switch">,
    public readonly project: ProjectModel,
  ) {
    makeAutoObservable(this);
    exposeDocFields(this);
  }

  // Alias for setIsOn since "status" is more intuitive
  setStatus(isOn: boolean | null) {
    this.setIsOn(isOn);
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

  /** Null when the outside world is blocked (HWIR dry runs). */
  private request(url: string, method: "GET" | "POST") {
    return reachOut<Promise<Response | null>>(
      `calling switch '${this.name}' ${method} ${url}`,
      () => fetch(url, { method }),
      Promise.resolve(null),
    );
  }

  async turnOn() {
    if (import.meta.env.VITE_IS_DEV_MODE) {
      this.setStatus(true);
      return;
    }

    const url = `${this.baseUrl}/turn_on`;

    const response = await this.request(url, "POST");
    if (!response) return;

    if (!response.ok)
      throw new Error(
        `Failed to turn on switch at ${this.ipAddress}: ${response.statusText}`,
      );

    this.setStatus(true);
  }

  async turnOff() {
    if (import.meta.env.VITE_IS_DEV_MODE) {
      this.setStatus(false);
      return;
    }

    const url = `${this.baseUrl}/turn_off`;

    const response = await this.request(url, "POST");
    if (!response) return;

    if (!response.ok)
      throw new Error(
        `Failed to turn off switch at ${this.ipAddress}: ${response.statusText}`,
      );

    this.setStatus(false);
  }

  async toggle() {
    const newState = this.isOn === null ? true : !this.isOn;

    if (import.meta.env.VITE_IS_DEV_MODE) {
      this.setStatus(newState);
      return;
    }

    const url = `${this.baseUrl}/toggle`;

    const response = await this.request(url, "POST");
    if (!response) return;

    if (!response.ok)
      throw new Error(
        `Failed to toggle switch at ${this.ipAddress}: ${response.statusText}`,
      );

    this.setStatus(newState);
  }

  async refreshStatus() {
    if (import.meta.env.VITE_IS_DEV_MODE)
      // In dev mode, don't fetch - just keep current status
      return;

    // For type2, assuming /switch/switch/ or similar returns JSON with state
    // This might need adjustment if type2 has a different status endpoint
    const url = `${this.baseUrl}/`;

    const response = await this.request(url, "GET");
    if (!response) return;

    if (!response.ok)
      throw new Error(
        `Failed to refresh switch status at ${this.ipAddress}: ${response.statusText}`,
      );

    const data = await response.json();
    const isOn = data?.state === "on" || data?.on === true;

    this.setStatus(isOn);
  }
}
