"use strict";
window.NUNCHI_API_CONFIG = {
  baseUrl: "https://backend-production-8acb6928.up.railway.app/api",
  wsUrl: "wss://backend-production-8acb6928.up.railway.app/ws",
  // Deployed card-objection and final-receipt API contract.
  agreementReviewV2: true,
  pollInterval: 10000,
  ...window.NUNCHI_API_CONFIG,
};
