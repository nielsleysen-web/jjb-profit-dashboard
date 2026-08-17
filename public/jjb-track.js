/* JJB Track — first-party ad attribution (v1)
 * Plaats dit script op ELKE funnelstap (Funnelish custom code, alle pagina's):
 *   <script src="https://jjb-profit-dashboard.vercel.app/jjb-track.js" async></script>
 * Op de eigen advertorial-pagina's (/a/...) wordt het automatisch geïnjecteerd.
 *
 * Wat het doet:
 *  1. Leest tracking-parameters uit de URL (fbclid + ad/adset/campaign-ID's die Meta
 *     invult via de URL-parameters op de ad) en bewaart ze in localStorage.
 *  2. Geeft ze bij elke klik door aan de volgende pagina (funnelish → advertorial →
 *     salespage), zodat niets verloren gaat tussen domeinen.
 *  3. Herschrijft Shopify cart/checkout-links zodat alles als order attributes
 *     (attributes[jjb_...]) in de bestelling belandt — daar leest de CRM ze uit.
 */
(function () {
  try {
    var KEYS = ["fbclid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "campaign_id", "adset_id", "ad_id", "placement"];
    var PASS = ["fbclid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "campaign_id", "adset_id", "ad_id"];
    var LS = "jjb_track";

    var q = new URLSearchParams(location.search);
    var data = {};
    try { data = JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) {}

    KEYS.forEach(function (k) {
      var v = q.get(k);
      if (v) data[k] = v.slice(0, 300);
    });
    // fbc opbouwen uit fbclid (Meta-formaat), of de _fbc/_fbp cookies van de pixel meepikken
    if (q.get("fbclid")) data.fbc = "fb.1." + Date.now() + "." + q.get("fbclid");
    var fbc = document.cookie.match(/(?:^|;\s*)_fbc=([^;]+)/);
    if (fbc && !data.fbc) data.fbc = decodeURIComponent(fbc[1]);
    var fbp = document.cookie.match(/(?:^|;\s*)_fbp=([^;]+)/);
    if (fbp) data.fbp = decodeURIComponent(fbp[1]);
    if (!data.vid) data.vid = "jjb." + Date.now().toString(36) + "." + Math.random().toString(36).slice(2, 10);
    if (!data.first_touch) data.first_touch = new Date().toISOString();
    data.last_url = location.href.slice(0, 500);
    try { localStorage.setItem(LS, JSON.stringify(data)); } catch (e) {}

    function decorate(a) {
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#" || /^(mailto:|tel:|javascript:)/i.test(href)) return;
      var url;
      try { url = new URL(href, location.href); } catch (e) { return; }
      if (!/^https?:$/.test(url.protocol)) return;
      if (/\/cart\//.test(url.pathname) || /\/checkouts?\//.test(url.pathname)) {
        // Shopify cart-permalink → alles als order attributes meesturen
        var attrs = ["ad_id", "adset_id", "campaign_id", "fbclid", "fbc", "fbp", "vid", "utm_source", "utm_campaign", "utm_content", "first_touch"];
        attrs.forEach(function (k) {
          if (data[k]) url.searchParams.set("attributes[jjb_" + k + "]", data[k]);
        });
      } else {
        // Gewone volgende stap → parameters gewoon doorgeven
        PASS.forEach(function (k) {
          if (data[k] && !url.searchParams.get(k)) url.searchParams.set(k, data[k]);
        });
      }
      a.setAttribute("href", url.toString());
    }

    // Bij klik decoreren (vangt ook links die later door JS zijn toegevoegd)
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (a) decorate(a);
    }, true);
    document.addEventListener("touchstart", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (a) decorate(a);
    }, true);
    // En alvast bij het laden
    function all() {
      try { document.querySelectorAll("a[href]").forEach(decorate); } catch (e) {}
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", all);
    else all();
    setTimeout(all, 1500);
    setTimeout(all, 4000);
  } catch (e) {}
})();
