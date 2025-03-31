import { Bridge } from "./bridge"
export { BridgeComponent } from "./bridge_component"
export { BridgeElement } from "./bridge_element"

if (!window.HotwireNative) {
  const webBridge = new Bridge()
  window.HotwireNative = { web: webBridge }

  // Legacy client support
  window.Strada = { web: webBridge }
  window.webBridge = webBridge
  
  webBridge.start()
}
