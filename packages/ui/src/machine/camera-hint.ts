export const CAMERA_HINT_SCRIPT = `try{let f={"#cam=screen":"screen","#cam=printer":"printer"}[decodeURIComponent(location.hash)];if(f)document.documentElement.dataset.camHint=f}catch{}`;

export const CAMERA_HINT_HASH =
  "'sha256-tTMEUDgxXHZOvKVUh16/PZGNDi8v2KPUOPVtv7E7X8Y='";
