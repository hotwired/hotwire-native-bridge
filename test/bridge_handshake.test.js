import { test } from "node:test"
import assert from "node:assert/strict"

// The library has no DOM in tests and no test dependencies. These stubs cover
// exactly what src/bridge.js and src/bridge_component.js touch.
const events = []
const listeners = new Map()

globalThis.document = {
  documentElement: { dataset: {} },
  dispatchEvent(event) {
    events.push(event)
    return true
  },
  addEventListener(name, handler) {
    listeners.set(name, handler)
  },
  removeEventListener(name) {
    listeners.delete(name)
  }
}

globalThis.window = {
  navigator: { userAgent: "Test; bridge-components: [chat page]" },
  location: { href: "https://example.com/chats/1" }
}

// The built bundle rather than src/, because src/ uses extensionless imports
// that only the bundler resolves - and because this is the artifact consumers
// actually load. Each import is cache-busted so every test gets its own Bridge.
let bundleRevision = 0

async function freshBridge() {
  delete window.HotwireNative
  delete window.Strada
  delete window.webBridge

  const bundle = await import(`../dist/hotwire-native-bridge.js?${bundleRevision++}`)
  return { bridge: window.HotwireNative.web, BridgeComponent: bundle.BridgeComponent }
}

function adapterFor() {
  return {
    platform: "ios",
    supportedComponents: [ "chat" ],
    supportsComponent(component) {
      return this.supportedComponents.includes(component)
    },
    receive() {}
  }
}

// Stands in for the adapter the native app injects at document start. It only
// registers when a destination owns the web view, which is the bug being
// repaired: the announcement made before one did was dropped.
function nativeAppWith({ destinationAttached, method = "postMessage" }) {
  const nativeBridge = { announcements: 0 }
  const announce = () => {
    nativeBridge.announcements++
    if (destinationAttached()) nativeBridge.onRegister()
  }

  if (method == "postMessage") {
    nativeBridge.postMessage = message => { if (message == "ready") announce() }
  } else {
    nativeBridge.ready = announce
  }

  return nativeBridge
}

async function build({ destinationAttached = () => false, method = "postMessage" } = {}) {
  const { bridge } = await freshBridge()

  // The bundle dispatches web-bridge:ready as it starts; the tests are about
  // what happens after that.
  events.length = 0
  bridge.handshakeTimeout = 20
  bridge.handshakeRepairTimeout = 60

  const nativeBridge = nativeAppWith({ destinationAttached, method })
  nativeBridge.onRegister = () => bridge.setAdapter(adapterFor())
  window.nativeBridge = nativeBridge

  return { bridge, nativeBridge }
}

const names = () => events.map(event => event.type)
const settled = () => new Promise(resolve => setTimeout(resolve, 120))

test("repairs the handshake when no adapter ever arrived", async () => {
  const { bridge, nativeBridge } = await build({ destinationAttached: () => true })

  bridge.componentDidConnect("chat")
  await settled()

  assert.equal(nativeBridge.announcements, 1)
  assert.deepEqual(names(), [ "web-bridge:handshake-failed", "web-bridge:handshake-repaired" ])
})

test("reports the failure before announcing, never after", async () => {
  const order = []
  const { bridge, nativeBridge } = await build({ destinationAttached: () => true })
  const announce = nativeBridge.postMessage
  nativeBridge.postMessage = message => { order.push("announce"); announce(message) }
  document.dispatchEvent = event => { order.push(event.type); events.push(event) }

  bridge.componentDidConnect("chat")
  await settled()

  assert.deepEqual(order.slice(0, 2), [ "web-bridge:handshake-failed", "announce" ])
  document.dispatchEvent = event => { events.push(event); return true }
})

test("says nothing and announces nothing when the adapter arrives in time", async () => {
  const { bridge, nativeBridge } = await build()

  bridge.componentDidConnect("chat")
  bridge.setAdapter(adapterFor())
  await settled()

  assert.equal(nativeBridge.announcements, 0)
  assert.deepEqual(names(), [])
})

test("does not announce when the adapter arrives while the failure is reported", async () => {
  const { bridge, nativeBridge } = await build()
  document.dispatchEvent = event => {
    events.push(event)
    if (event.type == "web-bridge:handshake-failed") bridge.setAdapter(adapterFor())
    return true
  }

  bridge.componentDidConnect("chat")
  await settled()

  assert.equal(nativeBridge.announcements, 0, "a second announcement here registers components twice")
  document.dispatchEvent = event => { events.push(event); return true }
})

test("reports the repair failing when the adapter still never arrives", async () => {
  const { bridge, nativeBridge } = await build({ destinationAttached: () => false })

  bridge.componentDidConnect("chat")
  await settled()

  assert.equal(nativeBridge.announcements, 1)
  assert.deepEqual(names(), [ "web-bridge:handshake-failed", "web-bridge:handshake-repair-failed" ])
})

test("watches for a component that only receives and never sends", async () => {
  const { bridge, nativeBridge } = await build({ destinationAttached: () => true })

  bridge.componentDidConnect("chat")
  await settled()

  assert.equal(nativeBridge.announcements, 1, "a receive-only component strands nothing, and is equally silenced")
})

test("does not watch a page with no bridge components", async () => {
  const { bridge, nativeBridge } = await build({ destinationAttached: () => true })

  await settled()

  assert.equal(nativeBridge.announcements, 0)
  assert.deepEqual(names(), [])
})

test("stops watching once the last component disconnects", async () => {
  const { bridge, nativeBridge } = await build({ destinationAttached: () => true })

  bridge.componentDidConnect("chat")
  bridge.componentDidConnect("page")
  bridge.componentDidDisconnect("chat")
  bridge.componentDidDisconnect("page")
  await settled()

  assert.equal(nativeBridge.announcements, 0)
  assert.deepEqual(names(), [])
})

test("announces the way the platform's injected adapter expects", async () => {
  const { bridge, nativeBridge } = await build({ destinationAttached: () => true, method: "ready" })

  bridge.componentDidConnect("chat")
  await settled()

  assert.equal(nativeBridge.announcements, 1)
  assert.deepEqual(names(), [ "web-bridge:handshake-failed", "web-bridge:handshake-repaired" ])
})

test("reports the failure but attempts nothing when no adapter is injected", async () => {
  const { bridge } = await build()
  delete window.nativeBridge

  bridge.componentDidConnect("chat")
  await settled()

  assert.deepEqual(names(), [ "web-bridge:handshake-failed" ])
})

test("can be turned off", async () => {
  const { bridge, nativeBridge } = await build({ destinationAttached: () => true })
  bridge.repairsHandshake = false

  bridge.componentDidConnect("chat")
  await settled()

  assert.equal(nativeBridge.announcements, 0)
  assert.deepEqual(names(), [ "web-bridge:handshake-failed" ])
})

test("the reported failure names the components that are stranded", async () => {
  const { bridge } = await build()

  bridge.componentDidConnect("chat")
  bridge.componentDidConnect("page")
  await settled()

  assert.deepEqual(events[0].detail.components, [ "chat", "page" ])
})

// The watch is armed from BridgeComponent, so a subclass that overrides
// connect() without calling super would never arm it - the same expectation the
// restore listener already relies on.
test("a connecting component registers itself with the bridge", async () => {
  const { BridgeComponent } = await freshBridge()
  const registered = []
  const component = Object.create(BridgeComponent.prototype)
  component.restore = () => {}
  Object.defineProperty(component, "component", { value: "chat" })
  Object.defineProperty(component, "bridge", {
    value: {
      componentDidConnect: name => registered.push([ "connect", name ]),
      componentDidDisconnect: name => registered.push([ "disconnect", name ]),
      removeCallbackFor() {},
      removePendingMessagesFor() {}
    }
  })
  component.pendingMessageCallbacks = []

  component.connect()
  component.disconnect()

  assert.deepEqual(registered, [ [ "connect", "chat" ], [ "disconnect", "chat" ] ])
})
