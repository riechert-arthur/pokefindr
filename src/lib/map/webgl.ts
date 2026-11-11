"use client"

let webglSupported: boolean | undefined

/** Whether the browser can create a WebGL context. Checked once per page load. */
export function hasWebGL(): boolean {
  if (webglSupported === undefined) {
    try {
      const canvas = document.createElement("canvas")
      webglSupported = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"))
    } catch {
      webglSupported = false
    }
  }
  return webglSupported
}
