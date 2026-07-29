if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });

      await registration.update();
    } catch (error) {
      console.error("Não foi possível ativar o modo PWA.", error);
    }
  });
}
