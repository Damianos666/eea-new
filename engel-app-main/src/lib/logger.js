// Wszystkie logi są wyciszane w buildzie produkcyjnym (import.meta.env.DEV = false)
// W dev: pełne logi z kolorami w konsoli
// W prod: cisza — żadne tokeny ani dane nie wyciekają do DevTools

const isDev = import.meta.env.DEV;

export const log  = (...args) => { if (isDev) console.log(...args); };
export const warn = (...args) => { if (isDev) console.warn(...args); };
export const err  = (...args) => { if (isDev) console.error(...args); };
