const { userAgent } = window.navigator

export const isHotwireNativeApp = /bridge-components: \[.+\]/.test(userAgent)
