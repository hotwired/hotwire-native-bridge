const { userAgent } = window.navigator

export function appSupportsBridgeComponent(component) {
  const supportedComponents = userAgent.match(/bridge-components: \[(.*?)\]/)

  if (supportedComponents) {
    return supportedComponents[1].split(" ").includes(component)
  } else {
    return false
  }
}
