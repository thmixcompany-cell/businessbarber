window.dataLayer = window.dataLayer || [];
function gtag() {
  window.dataLayer.push(arguments);
}
window.gtag = gtag;

gtag("js", new Date());
gtag("config", "AW-11311087522");

window.trackGoogleAdsPurchase = function trackGoogleAdsPurchase(transactionId) {
  gtag("event", "conversion", {
    send_to: "AW-11311087522/rf6rCPmVrr0cEKL_xZEq",
    value: 119.9,
    currency: "BRL",
    transaction_id: transactionId || "",
  });
};
