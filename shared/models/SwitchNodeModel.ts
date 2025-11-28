import { makeAutoObservable } from "mobx";
import type { Icon } from "./types";
import { ProjectModel } from "./ProjectModel";
import { NodeDocOfKind } from "../../convex/schema";

export class SwitchNodeModel {
  constructor(
    public doc: NodeDocOfKind<"switch">,
    public readonly project?: ProjectModel,
  ) {
    makeAutoObservable(this);
  }

  get _id() {
    return this.doc._id;
  }

  get _creationTime() {
    return this.doc._creationTime;
  }

  get order() {
    return this.doc.order;
  }

  get parentId() {
    return this.doc.parentId;
  }

  get projectId() {
    return this.doc.projectId;
  }

  get kind() {
    return this.doc.kind;
  }

  get name() {
    return this.doc.name;
  }

  get icon() {
    return this.doc.icon;
  }

  get ipAddress() {
    return this.doc.ipAddress;
  }

  get isOn() {
    return this.doc.isOn;
  }

  setName(name: string) {
    this.doc.name = name;
  }

  setIcon(icon: Icon) {
    this.doc.icon = icon;
  }

  setIpAddress(ipAddress: string) {
    this.doc.ipAddress = ipAddress;
  }

  setStatus(isOn: boolean | null) {
    this.doc.isOn = isOn;
  }

  update({
    name,
    icon,
    ipAddress,
  }: {
    name?: string;
    icon?: Icon;
    ipAddress?: string;
  }) {
    const doc = this.doc;
    if (name !== undefined) doc.name = name;
    if (icon !== undefined) doc.icon = icon;
    if (ipAddress !== undefined) doc.ipAddress = ipAddress;
  }

  remove() {
    if (!this.project) return;
    this.project.removeNode(this);
  }

  async turnOn() {
    const url = `http://${this.doc.ipAddress}/switch/smart_plug_v2/turn_on`;

    const response = await fetch(url, { method: "POST" });

    if (!response.ok)
      throw new Error(
        `Failed to turn on switch at ${this.doc.ipAddress}: ${response.statusText}`,
      );

    this.setStatus(true);
  }

  async turnOff() {
    const url = `http://${this.doc.ipAddress}/switch/smart_plug_v2/turn_off`;

    const response = await fetch(url, { method: "POST" });

    if (!response.ok)
      throw new Error(
        `Failed to turn off switch at ${this.doc.ipAddress}: ${response.statusText}`,
      );

    this.setStatus(false);
  }

  async toggle() {
    const url = `http://${this.doc.ipAddress}/switch/smart_plug_v2/toggle`;

    const response = await fetch(url, { method: "POST" });

    if (!response.ok)
      throw new Error(
        `Failed to toggle switch at ${this.doc.ipAddress}: ${response.statusText}`,
      );

    const newState = this.doc.isOn === null ? true : !this.doc.isOn;
    this.setStatus(newState);
  }

  async refreshStatus() {
    const url = `http://${this.doc.ipAddress}/switch/smart_plug_v2/`;

    const response = await fetch(url, { method: "GET" });

    if (!response.ok)
      throw new Error(
        `Failed to refresh switch status at ${this.doc.ipAddress}: ${response.statusText}`,
      );

    const data = await response.json();
    const isOn = data?.state === "on" || data?.on === true;

    this.setStatus(isOn);
  }
}
