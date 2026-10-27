// Change this to your deployed backend URL (no trailing slash) before deploying the frontend.
// Example: window.JALSANCHAY_API = "https://jalsanchay-api.onrender.com";
window.JALSANCHAY_API = window.location.hostname
  ? `${window.location.protocol}//${window.location.hostname}:4000`
  : "http://localhost:4000";
