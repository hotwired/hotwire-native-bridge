import { Bridge } from "./bridge"
export { BridgeComponent } from "./bridge_component"
export { BridgeElement } from "./bridge_element"

if (!window.HotwireNative) {
  const webBridge = new Bridge()
  window.HotwireNative = { web: webBridge }

  addLegacyClientSupport(webBridge)
  
  webBridge.start()
}

function addLegacyClientSupport(webBridge) {
  if (!window.Strada) {
    window.Strada = { web: webBridge }
  }

  if (!window.webBridge) {
    window.webBridge = webBridge
  }
}
