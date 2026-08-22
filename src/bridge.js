export class Bridge {
  #adapter
  #lastMessageId
  #pendingMessages
  #pendingCallbacks
  #connectedComponents
  #handshakeTimer
  #handshakeRepairTimer
  #handshakeRepairAttempted

  constructor() {
    this.#adapter = null
    this.#lastMessageId = 0
    this.#pendingMessages = []
    this.#pendingCallbacks = new Map()
    this.#connectedComponents = new Set()
    this.#handshakeTimer = null
    this.#handshakeRepairTimer = null
    this.#handshakeRepairAttempted = false

    // A page announces itself to the native app once, at document start. If no
    // destination owned the web view at that moment the announcement is lost, no
    // components are ever registered, and every message they send waits forever
    // in the pending queue without erroring. Announcing again recovers it.
    this.repairsHandshake = true
    this.handshakeTimeout = 2000
    this.handshakeRepairTimeout = 10000
  }

  // Watching starts when the first component connects rather than at start(),
  // because that is the first moment the page is known to have a component whose
  // messages could be stranded. A page with no bridge components never watches.
  componentDidConnect(component) {
    this.#connectedComponents.add(component)
    this.#startWatchingHandshake()
  }

  componentDidDisconnect(component) {
    this.#connectedComponents.delete(component)

    if (this.#connectedComponents.size == 0) {
      this.#stopWatchingHandshake()
    }
  }

  start() {
    this.notifyApplicationAfterStart()
  }

  notifyApplicationAfterStart() {
    document.dispatchEvent(new Event("web-bridge:ready"))
  }

  supportsComponent(component) {
    if (this.#adapter) {
      return this.#adapter.supportsComponent(component)
    } else {
      return false
    }
  }

  send({ component, event, data, callback }) {
    if (!this.#adapter) {
      this.#savePendingMessage({ component, event, data, callback })
      return null
    }

    if (!this.supportsComponent(component)) return null

    const id = this.generateMessageId()
    const message = { id: id, component: component, event: event, data: data || {} }
    this.#adapter.receive(message)

    if (callback) {
      this.#pendingCallbacks.set(id, callback)
    }

    return id
  }

  receive(message) {
    this.executeCallbackFor(message)
  }

  executeCallbackFor(message) {
    const callback = this.#pendingCallbacks.get(message.id)
    if (callback) {
      callback(message)
    }
  }

  removeCallbackFor(messageId) {
    if (this.#pendingCallbacks.has(messageId)) {
      this.#pendingCallbacks.delete(messageId)
    }
  }

  removePendingMessagesFor(component) {
    this.#pendingMessages = this.#pendingMessages.filter(message => message.component != component)
  }

  generateMessageId() {
    const id = ++this.#lastMessageId
    return id.toString()
  }

  setAdapter(adapter) {
    this.#adapter = adapter

    // Configure <html> attributes
    document.documentElement.dataset.bridgePlatform = this.#adapter.platform
    this.adapterDidUpdateSupportedComponents()
    this.#handshakeDidComplete()
    this.#sendPendingMessages()
  }

  adapterDidUpdateSupportedComponents() {
    if (this.#adapter) {
      document.documentElement.dataset.bridgeComponents = this.#adapter.supportedComponents.join(" ")
    }
  }

  #startWatchingHandshake() {
    if (this.#adapter || this.#handshakeTimer || this.#handshakeRepairAttempted) return

    this.#handshakeTimer = setTimeout(() => {
      this.#handshakeTimer = null
      this.#handshakeDidNotComplete()
    }, this.handshakeTimeout)
  }

  #stopWatchingHandshake() {
    clearTimeout(this.#handshakeTimer)
    clearTimeout(this.#handshakeRepairTimer)
    this.#handshakeTimer = null
    this.#handshakeRepairTimer = null
  }

  #handshakeDidNotComplete() {
    if (this.#adapter) return

    this.#notifyApplication("web-bridge:handshake-failed")
    if (!this.repairsHandshake) return

    // Re-read the adapter rather than trusting the check above: notifying the
    // application runs its listeners, and an adapter installed in that window
    // would make this a second announcement, which registers components twice.
    if (this.#adapter) return

    // Mark the attempt before announcing, not after: the app may answer the
    // announcement synchronously, and setAdapter has to see that a repair is
    // what brought it.
    this.#handshakeRepairAttempted = true

    if (!this.#announceToNativeApp()) {
      this.#handshakeRepairAttempted = false
      return
    }

    if (this.#adapter) return

    this.#handshakeRepairTimer = setTimeout(() => {
      this.#handshakeRepairTimer = null
      if (this.#adapter) return

      this.#notifyApplication("web-bridge:handshake-repair-failed")
    }, this.handshakeRepairTimeout - this.handshakeTimeout)
  }

  #handshakeDidComplete() {
    const repaired = this.#handshakeRepairAttempted
    this.#stopWatchingHandshake()

    if (repaired) {
      this.#notifyApplication("web-bridge:handshake-repaired")
    }
  }

  // iOS receives the announcement as a message; Android calls a method for it.
  // Both expose the adapter the native app injects as window.nativeBridge.
  #announceToNativeApp() {
    const nativeBridge = window.nativeBridge
    if (!nativeBridge) return false

    if (typeof nativeBridge.ready == "function") {
      nativeBridge.ready()
      return true
    }

    if (typeof nativeBridge.postMessage == "function") {
      nativeBridge.postMessage("ready")
      return true
    }

    return false
  }

  #notifyApplication(name) {
    const components = [ ...this.#connectedComponents ]
    document.dispatchEvent(new CustomEvent(name, { detail: { components } }))
  }

  #savePendingMessage(message) {
    this.#pendingMessages.push(message)
  }

  #sendPendingMessages() {
    this.#pendingMessages.forEach(message => this.send(message))
    this.#pendingMessages = []
  }
}
