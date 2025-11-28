import { Signal } from "../../../shared/Signal";

export class ObservableValue<T> {
  private _value: T;
  public readonly changed: Signal<T> = new Signal<T>();

  constructor(initialValue: T) {
    this._value = initialValue;
  }

  get value(): T {
    return this._value;
  }

  set value(next: T) {
    if (Object.is(this._value, next)) return;
    this._value = next;
    this.changed.dispatch(next);
  }
}
