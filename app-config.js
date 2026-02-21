const isLocalContext =
  typeof window !== "undefined" &&
  (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");

window.APP_CONFIG = {
  API_BASE_URL: isLocalContext
    ? "http://127.0.0.1:5050"
    : "https://apartment-api-ptpn.onrender.com",
};
