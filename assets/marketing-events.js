(function () {
  const storageKey = "businessBarberAttribution";
  const sessionKey = "businessBarberVisitId";
  const params = new URLSearchParams(window.location.search);
  const visitId = localStorage.getItem(sessionKey) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(sessionKey, visitId);

  const attribution = {
    source: params.get("utm_source") || "",
    medium: params.get("utm_medium") || "",
    campaign: params.get("utm_campaign") || "",
    term: params.get("utm_term") || "",
    content: params.get("utm_content") || "",
    gclid: params.get("gclid") || "",
    fbclid: params.get("fbclid") || "",
    referrer: document.referrer || "",
    sessionId: visitId,
  };

  if (Object.values(attribution).some(Boolean)) {
    localStorage.setItem(storageKey, JSON.stringify(attribution));
  }

  function savedAttribution() {
    try { return { ...JSON.parse(localStorage.getItem(storageKey) || "{}"), sessionId: visitId }; } catch { return { sessionId: visitId }; }
  }

  function track(event, detail = {}) {
    const payload = {
      ...savedAttribution(),
      event,
      page: window.location.pathname,
      ...detail,
    };
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/marketing-event", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/marketing-event", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
    if (window.gtag) {
      window.gtag("event", event, {
        event_category: "marketing_funnel",
        event_label: detail.target || window.location.pathname,
      });
    }
  }

  window.businessBarberTrack = track;

  document.addEventListener("DOMContentLoaded", () => {
    track("page_view_public");
    document.querySelectorAll("[data-track-event]").forEach((element) => {
      element.addEventListener("click", () => track(element.dataset.trackEvent, { target: element.dataset.trackTarget || element.textContent.trim().slice(0, 80) }));
    });
    document.querySelectorAll("form[data-track-submit]").forEach((form) => {
      form.addEventListener("submit", () => track(form.dataset.trackSubmit, { target: form.id || "form" }));
    });
  });
}());
