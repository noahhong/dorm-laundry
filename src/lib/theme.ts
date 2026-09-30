export const THEME_KEY = "dl:theme";

/** Runs before first paint (inlined in <head>) so a saved theme never flashes the wrong colors. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
