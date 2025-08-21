import { Controller } from "@hotwired/stimulus"
import { BridgeElement } from "./bridge_element"
import { appSupportsBridgeComponent } from "./helpers/user_agent"

export class BridgeComponent extends Controller {
  static component = ""

  static get shouldLoad() {
    return appSupportsBridgeComponent(this.component)
  }

  pendingMessageCallbacks = []

  initialize() {
    this.pendingMessageCallbacks = []
  }

  connect() {
    this.removeRestoreEventListener()
    this.addRestoreEventListener()
  }

  disconnect() {
    this.removePendingCallbacks()
    this.removePendingMessages()
    this.removeRestoreEventListener()
  }

  addRestoreEventListener() {
    this.restore = this.restore.bind(this)
    document.addEventListener("native:restore", this.restore)
  }

  removeRestoreEventListener() {
    document.removeEventListener("native:restore", this.restore)
  }

  restore() {
    // Manually call connect() so the native bridge component has
    // a chance to restore its view state if it needs to be recreated.
    this.connect()
  }

  get component() {
    return this.constructor.component
  }

  get platformOptingOut() {
    const { bridgePlatform } = document.documentElement.dataset
    return (
      this.identifier ==
      this.element.getAttribute(`data-controller-optout-${bridgePlatform}`)
    )
  }

  get enabled() {
    return (
      !this.platformOptingOut &&
      this.bridge.supportsComponent(this.component)
    )
  }

  send(event, data = {}, callback) {
    // Include the url with each message, so the native app can
    // ensure messages are delivered to the correct destination
    data.metadata = {
      url: window.location.href
    }

    const message = { component: this.component, event, data, callback }
    const messageId = this.bridge.send(message)
    if (callback) {
      // Track messages that we have callbacks for so we can clean up when disconnected
      this.pendingMessageCallbacks.push(messageId)
    }
  }

  removePendingCallbacks() {
    this.pendingMessageCallbacks.forEach(messageId => this.bridge.removeCallbackFor(messageId))
  }

  removePendingMessages() {
    this.bridge.removePendingMessagesFor(this.component)
  }

  get bridgeElement() {
    return new BridgeElement(this.element)
  }

  get bridge() {
    return window.HotwireNative.web
  }
}
