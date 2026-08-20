/**
 * Coordinates mutually exclusive form-control popups without owning any DOM.
 * Component models activate themselves here and provide their own close action.
 */
export class FloatingControlModel {
  constructor() {
    this._active = null;
  }

  activate(owner, close) {
    if (!owner || typeof close !== "function") return false;
    if (this._active?.owner === owner) {
      this._active.close = close;
      return true;
    }

    const previous = this._active;
    this._active = { close, owner };
    previous?.close("superseded");
    return true;
  }

  release(owner) {
    if (this._active?.owner !== owner) return false;
    this._active = null;
    return true;
  }

  isActive(owner) {
    return this._active?.owner === owner;
  }

  reset() {
    const active = this._active;
    this._active = null;
    active?.close("reset");
  }
}

export const floatingControlModel = new FloatingControlModel();
