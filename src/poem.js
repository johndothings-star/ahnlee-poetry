const shareButton = document.querySelector("[data-share-poem]");

if (shareButton) {
  const originalLabel = shareButton.innerHTML;
  let resetTimer;

  async function copyUrl(url) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return;
    }

    const field = document.createElement("textarea");
    field.value = url;
    field.setAttribute("readonly", "");
    field.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (!copied) throw new Error("Không thể chép đường dẫn.");
  }

  function showCopied() {
    clearTimeout(resetTimer);
    shareButton.textContent = "Đã chép đường dẫn ✓";
    resetTimer = setTimeout(() => {
      shareButton.innerHTML = originalLabel;
    }, 1800);
  }

  shareButton.addEventListener("click", async () => {
    const shareData = {
      title: shareButton.dataset.shareTitle || document.title,
      url: window.location.href,
    };

    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    try {
      await copyUrl(shareData.url);
      showCopied();
    } catch {
      shareButton.textContent = "Không chép được đường dẫn";
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        shareButton.innerHTML = originalLabel;
      }, 1800);
    }
  });
}
