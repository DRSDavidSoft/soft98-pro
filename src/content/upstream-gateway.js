(function soft98UpstreamGatewayMarker() {
  "use strict";
  try {
    document.documentElement.setAttribute("data-soft98-pro-upstream", "network-intercepted");
    window.dispatchEvent(new CustomEvent("soft98-pro:upstream-intercepted"));
  } catch (_error) {}
})();
