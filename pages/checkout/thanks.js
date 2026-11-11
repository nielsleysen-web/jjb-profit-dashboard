// pages/checkout/thanks.js — English thank-you page for the English USD checkout (checkout.getjustjenny.com/en/pumpkinoil).
// Same data + Meta Purchase pixel (event_id jjb-<order> → dedup with the webhook's CAPI event) as pages/checkout/grazie.js,
// without the Italian quiz and upsell. Stripe: ?sub=sub_…  PayPal: ?pp=I-…  Without ?sub= → preview with sample data.
import { useEffect, useRef, useState } from "react";
import Head from "next/head";
import { getProduct, pickBundleFor, shippingFor, insuranceFor, currencyOf, membershipOf, insuranceOf } from "../../lib/checkout";

const GREEN = "#5f9a7c";
const PURPLE = "#5433eb";
const SGL = "https://cannella.getjustjenny.com/sage/assets/uploads/";
const IMGS_BY = { sageleaf: { 1: SGL + "ed-pic-8.webp?v=c1", 3: SGL + "ed-pic-9.webp?v=c1", 5: SGL + "ed-pic-10.webp?v=c1" } };
const IMGS = { 1: "https://cannella.getjustjenny.com/assets/offer/zakje-1x.webp?v=o1", 3: "https://cannella.getjustjenny.com/assets/offer/zakjes-3x.webp?v=o1", 5: "https://cannella.getjustjenny.com/assets/offer/zakjes-5x.webp?v=o1" };
const COUNTRY = { US: "United States", CA: "Canada", GB: "United Kingdom", AU: "Australia", NZ: "New Zealand" };
const BRAND = { amex: "American Express", visa: "Visa", mastercard: "Mastercard", maestro: "Maestro", discover: "Discover", jcb: "JCB", unionpay: "UnionPay", diners: "Diners Club" };
const WALLET = { apple_pay: "Apple Pay", google_pay: "Google Pay", link: "Link" };
const PREVIEW = {
  paid: true, created: Math.floor(Date.now() / 1000), qty: 3, shipping: "insured", insurance: 495, amountPaid: 6885,
  email: "jane.doe@example.com", name: "Jane Doe", phone: "+1 555 123 4567",
  address: { line1: "123 Main Street", line2: "", postal_code: "90210", city: "Beverly Hills", state: "CA", country: "US" },
  payment: { type: "card", brand: "visa", last4: "4242" }, order: { name: "#0000", statusPageUrl: "#", tax: 0 },
};

const css = `
  *{box-sizing:border-box}
  body{margin:0;background:#fff;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .gz-wrap{max-width:672px;margin:0 auto;padding:0 16px 60px}
  .gz-card{border:1px solid #e3e3e3;border-radius:14px;background:#fff;padding:18px 16px;margin-top:18px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
  /* Header = zelfde als de checkout (logo · pil met klanten · 3 voordelen) */
  .jh{background:#fff;border-bottom:1px solid #e3e3e3;padding:12px 16px 10px;text-align:center}
  .jh-logo{height:22px;width:auto;display:block;margin:0 auto}
  .jh-pill{display:inline-flex;align-items:center;gap:10px;margin:10px auto 0;padding:6px 18px 6px 8px;border-radius:10px;background:linear-gradient(90deg,#fdeee4 0%,#fbe6da 50%,#fdf3ec 100%)}
  .jh-avs{display:inline-flex}
  .jh-av{position:relative;width:28px;height:28px;border-radius:50%;border:2px solid #fff;margin-left:-8px;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,.12)}
  .jh-av:first-child{margin-left:0}
  .jh-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .jh-av1{background:#df8455}.jh-av2{background:#c96f43}.jh-av3{background:#e9a07a}
  .jh-count{font-size:14.5px;letter-spacing:.3px;color:#1a1a1a;white-space:nowrap}
  .jh-count b{font-weight:800}
  .jh-ben{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:9px;color:#333;font-size:13px}
  .jh-ben span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
  .jh-ben b{font-weight:700}
  .jh-ben em{font-style:normal}
  .jh-ben svg{width:16px;height:16px;flex:none;color:#444}
  .jh-ben i{width:1px;height:16px;background:#d9d9d9}
  @media (max-width:640px){
    .jh{padding:10px 8px 9px}
    .jh-logo{height:17px}
    .jh-pill{gap:8px;padding:5px 13px 5px 7px;margin-top:8px}
    .jh-av{width:22px;height:22px;margin-left:-7px;font-size:9px;border-width:1.5px}
    .jh-count{font-size:12px}
    .jh-ben{gap:6px;font-size:10.5px;margin-top:8px}
    .jh-ben span{gap:3px}
    .jh-ben svg{width:13px;height:13px}
    .jh-ben i{height:13px}
  }
  .gz-q textarea{width:100%;min-height:124px;border:1px solid #d9d9d9;border-radius:10px;padding:14px 12px;font:inherit;font-size:15px;resize:vertical;outline:none;color:#1a1a1a}
  .gz-q textarea:focus{border-color:${GREEN};box-shadow:0 0 0 1px ${GREEN}}
  .gz-btn{border:none;border-radius:10px;background:${GREEN};color:#fff;font:inherit;font-size:15px;font-weight:700;padding:15px 16px;cursor:pointer}
  .gz-btn:disabled{opacity:.7;cursor:default}
  .gz-outline{border:1px solid #dcdcdc;border-radius:10px;background:#fff;color:${GREEN};font-weight:600;font-size:14.5px;padding:10px 12px;text-decoration:none;white-space:nowrap}
  .gz-track{display:inline-block;background:${PURPLE};color:#fff;border-radius:6px;padding:12px 16px;font-size:15px;font-weight:500;text-decoration:none;min-width:300px;text-align:center}
  .gz-line{display:flex;justify-content:space-between;font-size:14.5px;margin:6px 0}
  .gz-dl{border:1px solid #e3e3e3;border-radius:14px;margin-top:18px;overflow:hidden}
  .gz-dl .r{display:grid;grid-template-columns:112px 1fr;gap:12px;padding:16px;font-size:14.5px;line-height:1.45;border-top:1px solid #e3e3e3}
  .gz-dl .r:first-child{border-top:none}
  .gz-dl .k{color:#6b6b6b}
  .gz-note{background:#fff8e6;border:1px solid #f1dca7;border-radius:10px;padding:10px 12px;font-size:13px;color:#6b5314;margin-top:14px}
  @media (max-width:520px){ .gz-track{min-width:0;width:100%} .gz-dl .r{grid-template-columns:92px 1fr} }
`;

const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
function paymentLabel(p) {
  if (!p) return "—";
  if (p.type === "card") {
    const brand = BRAND[p.brand] || (p.brand ? p.brand[0].toUpperCase() + p.brand.slice(1) : "Card");
    return `${p.wallet && WALLET[p.wallet] ? WALLET[p.wallet] + " · " : ""}${brand} · ${p.last4}`;
  }
  if (p.type === "paypal") return "PayPal";
  return p.type;
}

export default function Thanks() {
  const [q, setQ] = useState(null);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const tries = useRef(0);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setQ({ sub: p.get("sub") || p.get("pp") || "", paypal: !!p.get("pp"), b: p.get("b"), p: (p.get("p") || "pumpkinoil").toLowerCase(), rs: p.get("redirect_status") || "" });
  }, []);

  useEffect(() => {
    if (!q) return;
    if (!q.sub) { setData({ ...PREVIEW, product: getProduct(q.p).key, qty: pickBundleFor(getProduct(q.p), q.b).qty }); return; }
    let timer;
    const load = async () => {
      try {
        const url = q.paypal ? `/api/paypal/order?id=${encodeURIComponent(q.sub)}` : `/api/stripe/order?sub=${encodeURIComponent(q.sub)}`;
        const r = await fetch(url).then((x) => x.json());
        if (r.error) { setErr(r.error); return; }
        setData(r);
        tries.current += 1;
        if ((!r.order || !r.paid) && tries.current < 12) timer = setTimeout(load, 3000);
      } catch {
        if (tries.current++ < 5) timer = setTimeout(load, 3000);
      }
    };
    load();
    return () => clearTimeout(timer);
  }, [q]);

  // Meta pixel: Purchase in the browser with the same event_id as the server-side CAPI event → counted once
  useEffect(() => {
    if (!q?.sub || !data?.paid || !data?.order?.name) return;
    const orderNo = String(data.order.name).replace("#", "");
    const key = `jjb_purchase_${orderNo}`;
    try { if (localStorage.getItem(key)) return; } catch {}
    fetch("/api/checkout-config").then((r) => r.json()).then((cfg) => {
      const pixelId = cfg?.pixelId || cfg?.META_PIXEL_ID;
      if (!pixelId) return;
      if (!window.fbq) {
        /* eslint-disable */
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        /* eslint-enable */
        window.fbq("init", pixelId);
        window.fbq("track", "PageView");
      }
      const prod = getProduct(data.product || q.p);
      const b = pickBundleFor(prod, data.qty || q.b);
      const S = shippingFor(currencyOf(prod));
      window.fbq("track", "Purchase", {
        value: (data.amountPaid ?? b.price + (S[data.shipping] || S.insured).price) / 100,
        currency: currencyOf(prod).toUpperCase(),
        content_type: "product", content_ids: [prod.shopifyProductId],
        contents: [{ id: prod.shopifyProductId, quantity: b.qty }], num_items: b.qty, order_id: orderNo,
      }, { eventID: `jjb-${orderNo}` });
      try { localStorage.setItem(key, "1"); } catch {}
    }).catch(() => {});
  }, [q, data]);

  const preview = q && !q.sub;
  const failed = q?.rs === "failed";
  const product = getProduct(data?.product || q?.p || "pumpkinoil");
  const CUR = currencyOf(product).toUpperCase();
  const fmt = (c) => (CUR === "USD" ? "$" : "") + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (CUR === "USD" ? "" : " " + CUR);
  const SHIP = shippingFor(currencyOf(product));
  const bundle = pickBundleFor(product, data?.qty || q?.b);
  const ship = SHIP[data?.shipping] || SHIP.insured;
  const insurance = Number(data?.insurance) || 0;
  const total = data?.amountPaid ?? bundle.price + ship.price + insurance;
  const date = fmtDate(data?.created || Math.floor(Date.now() / 1000));
  const addr = data?.address || {};
  const buyAgain = `/en/${product.key}?b=${bundle.qty}`;
  const M = membershipOf(product, bundle);

  return (
    <>
      <Head>
        <script dangerouslySetInnerHTML={{ __html: '(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "ukbt3fboo0");' }} />
        <title>Thank you — Just Jenny</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <script src="https://pixel.wetracked.io/funnel/init.js" async />
      </Head>

      <header className="jh">
        <img className="jh-logo" src="https://cdn.shopify.com/s/files/1/0901/0606/9258/files/Layer_1.png?v=1749455114" alt="Just Jenny" />
        <div className="jh-ben">
          <span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 7v5.2l3.4 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg><em><b>FAST</b> Shipping</em></span>
          <i />
          <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l7.5 2.9v5.4c0 4.8-3.2 8.7-7.5 10.3-4.3-1.6-7.5-5.5-7.5-10.3V5.7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M8.6 12.2l2.4 2.3 4.4-4.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>90-Day Guarantee</span>
          <i />
          <span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8.3 10.5V7.8a3.7 3.7 0 017.4 0v2.7" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="15.5" r="1.2" fill="currentColor" /></svg>Secure Checkout</span>
        </div>
      </header>

      <div className="gz-wrap">
        {preview && <div className="gz-note">Preview with sample data — after a real payment, your order details appear here.</div>}

        {failed ? (
          <div className="gz-card">
            <div style={{ fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>Payment failed</div>
            <div style={{ fontSize: "15px", color: "#555", lineHeight: 1.55 }}>
              Your payment did not go through. You have not been charged.{" "}
              <a href={buyAgain} style={{ color: GREEN, fontWeight: 600 }}>Try again</a>
            </div>
          </div>
        ) : err ? (
          <div className="gz-card" style={{ fontSize: "15px", lineHeight: 1.55 }}>
            <b>Thank you for your order!</b><br />We can’t load the details right now. You’ll receive a confirmation email.
          </div>
        ) : !data ? (
          <div className="gz-card" style={{ fontSize: "15px", color: "#666" }}>Loading your order…</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginTop: "26px" }}>
              <div>
                <div style={{ fontSize: "20px", fontWeight: 600 }}>{data.order?.name ? `Order ${data.order.name}` : "Order confirmed"}</div>
                <div style={{ fontSize: "14px", color: "#6b6b6b", marginTop: "3px" }}>Confirmed on {date}</div>
              </div>
              <a className="gz-outline" href={buyAgain}>Buy again</a>
            </div>

            <div className="gz-card">
              <div style={{ display: "flex", gap: "10px" }}>
                <span style={{ fontSize: "16px", lineHeight: "20px", color: "#444" }}>✓</span>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 600 }}>{data.paid === false || q.rs === "processing" ? "Processing" : "Confirmed"}</div>
                  <div style={{ fontSize: "14.5px", marginTop: "2px" }}>
                    {data.paid === false || q.rs === "processing" ? "We’re confirming your payment. You’ll receive an email shortly." : "We’re getting your items ready to ship."}
                  </div>
                  <div style={{ fontSize: "13px", color: "#6b6b6b", marginTop: "4px" }}>{date}</div>
                </div>
              </div>
              {data.order?.statusPageUrl && (
                <div style={{ marginTop: "20px" }}>
                  <a className="gz-track" href={data.order.statusPageUrl} target="_blank" rel="noopener noreferrer">Track order</a>
                </div>
              )}
            </div>

            {M && (
              <div className="gz-card" style={{ background: "#f6faf7", borderColor: "#d9eadf", fontSize: "14px", lineHeight: 1.55 }}>
                {M.refill ? (<><b>Your refill subscription is active.</b> The same bundle ({bundle.label}) ships every {M.intervalDays} days for {fmt(M.price)} with free shipping. Your first refill is charged {M.intervalDays} days from today. Skip or cancel anytime by emailing <a href="mailto:Hello@justjennybeauty.com" style={{ color: GREEN }}>Hello@justjennybeauty.com</a>. <a href="/checkout/terms#refill" target="_blank" rel="noopener" style={{ color: GREEN }}>Refill terms</a></>) : (<><b>Your {M.name}</b> is active, starting with a {M.trialDays}-day free trial. After that it’s {fmt(M.price)} every {M.intervalDays} days — cancel anytime by emailing <a href="mailto:Hello@justjennybeauty.com" style={{ color: GREEN }}>Hello@justjennybeauty.com</a>. <a href="/checkout/terms#membership" target="_blank" rel="noopener" style={{ color: GREEN }}>Membership terms</a>
              </>)}
              </div>
            )}

            <div className="gz-card">
              <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                <div style={{ position: "relative", width: "64px", height: "64px", border: "1px solid #e3e3e3", borderRadius: "10px", background: "#f7f7f7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <img src={(IMGS_BY[product.key] || IMGS)[bundle.qty] || IMGS[1]} alt="" style={{ maxWidth: "54px", maxHeight: "54px" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  <span style={{ position: "absolute", top: "-8px", right: "-8px", background: "#111", color: "#fff", borderRadius: "999px", minWidth: "21px", height: "21px", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>1</span>
                </div>
                <div style={{ flex: 1, fontSize: "14.5px", paddingTop: "14px" }}>
                  <div>{product.title}</div>
                  <div style={{ color: "#6b6b6b", fontSize: "13px", marginTop: "2px" }}>{bundle.label}</div>
                </div>
                <div style={{ fontSize: "14.5px", paddingTop: "14px" }}>{fmt(bundle.price)}</div>
              </div>
              <div style={{ marginTop: "26px" }}>
                <div className="gz-line"><span>Subtotal</span><span>{fmt(bundle.price)}</span></div>
                <div className="gz-line"><span>Shipping</span><span>{ship.price ? fmt(ship.price) : "Free"}</span></div>
                {insurance > 0 && <div className="gz-line"><span>{insuranceOf(product).title}</span><span>{fmt(insurance)}</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "14px" }}>
                  <span style={{ fontSize: "18px", fontWeight: 700 }}>Total</span>
                  <span><span style={{ fontSize: "12px", color: "#6b6b6b", marginRight: "6px" }}>{CUR}</span><b style={{ fontSize: "19px" }}>{fmt(total)}</b></span>
                </div>
              </div>
            </div>

            <div className="gz-dl">
              <div className="r"><div className="k">Contact</div><div style={{ wordBreak: "break-all" }}>{data.email || "—"}</div></div>
              <div className="r">
                <div className="k">Ship to</div>
                <div>
                  {data.name && <div>{data.name.toUpperCase()}</div>}
                  {addr.line1 && <div>{addr.line1.toUpperCase()}</div>}
                  {addr.line2 && <div>{addr.line2}</div>}
                  {(addr.postal_code || addr.city) && <div>{[addr.city, addr.state, addr.postal_code].filter(Boolean).join(" ")}</div>}
                  {addr.country && <div>{COUNTRY[addr.country] || addr.country}</div>}
                  {data.phone && <div>{data.phone}</div>}
                </div>
              </div>
              <div className="r"><div className="k">Method</div><div>{ship.title}</div></div>
              <div className="r">
                <div className="k">Payment</div>
                <div>
                  <div>{paymentLabel(data.payment)}</div>
                  <div style={{ color: "#6b6b6b", fontSize: "13px", marginTop: "2px" }}>{fmt(total)} {CUR} · {date}</div>
                </div>
              </div>
            </div>
          </>
        )}

        <p style={{ marginTop: "24px", fontSize: "13px", color: "#737373", textAlign: "center" }}>
          Questions? Email us: <a href="mailto:Hello@justjennybeauty.com" style={{ color: GREEN }}>Hello@justjennybeauty.com</a>
        </p>
      </div>
    </>
  );
}
