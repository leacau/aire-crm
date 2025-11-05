// This creates a global event emitter instance.
// We use a browser's CustomEvent system if available, otherwise a simple fallback.
class Emitter {
  private target: EventTarget;
  constructor() {
    this.target = typeof window !== 'undefined' ? new EventTarget() : {
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as EventTarget;
  }

  on(type: string, listener: EventListenerOrEventListenerObject) {
    this.target.addEventListener(type, listener);
  }

  off(type: string, listener: EventListenerOrEventListenerObject) {
    this.target.removeEventListener(type, listener);
  }

  emit(type: string, detail: any) {
    const event = new CustomEvent(type, { detail });
    this.target.dispatchEvent(event);
  }
}

export const errorEmitter = new Emitter();
