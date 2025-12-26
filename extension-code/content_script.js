(() => {
  const safeText = (node) => (node && node.innerText) || "";

  const extractJob = () => {
    const titleNode = document.querySelector("h1, h2, [data-test-title], [data-qa='job-title']");
    const companyNode = document.querySelector("[data-test-company], [data-qa='company-name'], .job-company, .company");
    const locationNode = document.querySelector("[data-test-location], [data-qa='job-location'], .job-location, .location");
    const descriptionNode = document.querySelector("[data-qa='job-description'], [data-test-description], .job-description, article, main");

    const descriptionText = descriptionNode ? descriptionNode.innerText || descriptionNode.textContent || "" : document.body.innerText || "";

    return {
      job: {
        title: safeText(titleNode) || document.title || "",
        company: safeText(companyNode),
        location: safeText(locationNode),
        description_text: descriptionText
      },
      meta: {
        url: window.location.href,
        extraction_method: "content_script",
        user_tags: [],
        notes: "",
        platform: window.location.hostname
      }
    };
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return undefined;

    if (message.type === "ping") {
      sendResponse({ ok: true });
      return true;
    }

    if (message.type === "extract_job") {
      try {
        const data = extractJob();
        sendResponse({ ok: true, data });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || "Extraction failed" });
      }
      return true;
    }

    return undefined;
  });
})();
