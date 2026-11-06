// pages/checkout/terms.js — Terms & Conditions in English (Just Jenny / Vena Corporate LLC) for the English USD checkout
// (checkout.getjustjenny.com/en/pumpkinoil). Same structure as pages/checkout/termini.js (Italian), adapted to the
// Daily Vitality Membership: 14-day free trial, then $49.95 every 28 days. No members area yet → managed by email.
import Head from "next/head";

const LOGO = "https://cdn.shopify.com/s/files/1/0901/0606/9258/files/Layer_1.png?v=1749455114";
const UPDATED = "November 7, 2026";
const COMPANY = "Vena Corporate LLC";
const ADDRESS = "30 N Gould St, STE R, Sheridan, WY 82801, United States";
const EIN = "37-2157232";
const EMAIL = "Hello@justjennybeauty.com";
const MNAME = "Daily Vitality Membership";
const PRODUCT = "Just Jenny\u2122 Pumpkin Seed Oil Softgels";
const TRIAL = 14, PRICE = "$49.95", CYCLE = 28;

const css = `
:root{--page:#f3efd8;--peach:#fde2cc;--peach2:#fdf3ea;--terra:#e0855e;--fg:#222;--fh:"Roboto",Arial,Helvetica,sans-serif;--fb:Arial,Helvetica,sans-serif}
*{box-sizing:border-box}
html,body{margin:0;background:var(--page);color:var(--fg);font-family:var(--fb);line-height:1.55;font-size:16px;-webkit-font-smoothing:antialiased}
.col{max-width:760px;margin:0 auto;padding:0 0 40px}
.hdr{background:#fff;padding:18px 22px 14px;border-bottom:3px solid var(--terra)}
.logo{display:block;height:26px;width:auto;margin:0 auto}
.paper{background:#fff;padding:30px 26px 36px}
h1{font-family:var(--fh);font-size:28px;font-weight:900;line-height:1.15;margin:0 0 6px}
.upd{color:#666;font-size:14px;margin:0 0 22px}
h2{font-family:var(--fh);font-size:19px;font-weight:900;margin:30px 0 10px;color:#1a1a1a;text-transform:uppercase;letter-spacing:.3px}
h3{font-family:var(--fh);font-size:16.5px;font-weight:700;margin:18px 0 6px}
p{margin:0 0 12px}
ul{margin:0 0 12px;padding-left:22px}li{margin-bottom:6px}
a{color:#c96f43;font-weight:700}
.box{background:var(--peach2);border:1px solid #f1d9c9;border-left:5px solid var(--terra);border-radius:10px;padding:16px 18px;margin:16px 0 22px}
.box p:last-child{margin:0}
.toc{background:#faf7f1;border-radius:10px;padding:14px 18px;margin:0 0 10px;font-size:14.5px}
.toc a{font-weight:600;display:inline-block;margin:2px 10px 2px 0}
.foot{text-align:center;font-size:13px;color:#666;padding:18px 22px 0}
.foot a{color:#c96f43}
@media (max-width:640px){.paper{padding:24px 18px 30px}h1{font-size:24px}}
`;

export default function Terms() {
  const mail = <a href={`mailto:${EMAIL}`}>{EMAIL}</a>;
  return (
    <>
      <Head>
        <title>Terms &amp; Conditions — Just Jenny</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </Head>
      <div className="col">
        <div className="hdr"><img className="logo" src={LOGO} alt="Just Jenny" /></div>
        <div className="paper">
          <h1>Terms &amp; Conditions</h1>
          <p className="upd">Last updated: {UPDATED}</p>

          <div className="toc">
            <a href="#overview">Overview</a><a href="#law">Governing law</a><a href="#membership">{MNAME}</a><a href="#guarantee">90-day guarantee</a><a href="#products">Products</a><a href="#sms">SMS</a><a href="#general">General conditions</a><a href="#contact">Contact</a>
          </div>

          <h2 id="overview">Overview</h2>
          <p>This website and the Just Jenny checkout are operated by <b>{COMPANY}</b>, {ADDRESS} (EIN {EIN}). Throughout the site, the terms “we”, “us” and “our” refer to {COMPANY}, operating under the brand <b>Just Jenny</b>. Just Jenny offers this website, including all information, tools and services available from it, to you on the condition that you accept all terms, conditions, policies and notices stated here.</p>
          <p>By visiting our site and/or purchasing something from us, you use our “Service” and agree to be bound by these terms and conditions (“Terms of Service”, “Terms”), including the additional terms, conditions and policies referenced here and/or available by hyperlink. These Terms apply to all users of the site, including without limitation visitors, vendors, customers, merchants and/or contributors of content.</p>
          <p>Please read these Terms carefully before accessing or using our website. By accessing or using any part of the site, you agree to be bound by these Terms. If you do not agree to all the terms and conditions of this agreement, you may not access the website or use any services.</p>
          <p>Our store is hosted on Shopify Inc. Payments are processed by third-party payment providers, including Stripe and PayPal; your payment details are transmitted encrypted directly to those providers.</p>

          <h2 id="law">Governing law and jurisdiction</h2>
          <p>These Terms and any separate agreements whereby we provide you Services are governed by the laws of the United States of America and, subsidiarily, the laws of the State of Wyoming, without regard to conflict-of-law principles. Any dispute arising from these Terms shall be submitted to a competent court in the State of Wyoming, United States of America.</p>
          <p>Nothing in these Terms limits any mandatory rights you may have under the laws of your country of residence.</p>

          <h2 id="membership">{MNAME} Terms</h2>
          <div className="box">
            <p><b>In short:</b> the {MNAME} starts with a <b>{TRIAL}-day free trial</b>. If you do not cancel before the trial ends, your payment method will be charged <b>{PRICE}</b> every <b>{CYCLE} days</b> until you cancel. You can cancel at any time by emailing {mail}. We send you an email reminder <b>3 days before</b> each charge.</p>
          </div>

          <h3>Subscription program</h3>
          <p>When the {MNAME} is added to your order, you enroll in an automatically renewing subscription program.</p>

          <h3>Free trial and recurring charges</h3>
          <p>Your membership starts with a {TRIAL}-day free trial. Unless you cancel before the trial ends, you authorize Just Jenny to automatically charge the payment method used for your original order {PRICE} (USD) every {CYCLE} days until you cancel.</p>

          <h3>Membership benefits</h3>
          <p>While your membership is active, you can access member-only benefits, including eligible products and content for everyday wellness, member-only offers, dedicated support and other benefits made available by Just Jenny. The available benefits, quantities, availability, any shipping and handling fees and other conditions are communicated to you by email at the start of each billing cycle.</p>

          <h3>Managing your membership</h3>
          <p>You can manage your membership by emailing {mail}: view your membership status, update your payment details, change or cancel your membership. We reply within one business day.</p>

          <h3>Cancellation</h3>
          <p>You can cancel your membership at any time by emailing {mail}. To avoid the next recurring charge, cancellation must be completed before the next scheduled billing date.</p>
          <p>Cancelling your membership stops future charges, but does not automatically cancel or refund orders or charges that have already been processed.</p>

          <h3>Billing descriptor</h3>
          <p>Membership charges appear on your statement as <b>JUST JENNY</b>, the same as (or substantially similar to) the descriptor used for your original purchase.</p>

          <h3>Billing reminders</h3>
          <p>We send you an email reminder 3 days before each membership charge. You remain responsible for managing or cancelling your membership before the applicable billing date.</p>

          <h3>Membership refunds</h3>
          <p>Once a recurring membership charge has been processed, the fee for that billing period is non-refundable, except as otherwise required by applicable law or approved under Just Jenny’s refund policies.</p>

          <h3>Authorization</h3>
          <p>By completing your purchase with the membership included, you confirm that you have read and agree to these {MNAME} Terms. You authorize Just Jenny to charge your selected payment method {PRICE} every {CYCLE} days after the {TRIAL}-day free trial, until you cancel.</p>
          <p>For questions about your membership, email {mail}.</p>

          <h2 id="guarantee">90-day money-back guarantee</h2>
          <p>The 90-day money-back guarantee applies only to <b>unopened</b> products with the seal intact, returned within 90 days of the order date. Consumable products that have been opened cannot be returned or refunded for hygiene and safety reasons. To start a refund request, email {mail} with your order number and you will receive return instructions. The refund is processed to the original payment method after the returned products have been received and checked.</p>

          <h2 id="products">Products</h2>
          <p>{PRODUCT} is a dietary supplement. These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure or prevent any disease. Consult your doctor before use if you are pregnant, nursing, taking medication or have a medical condition.</p>
          <p>Certain products or services may be available exclusively online through the website. These products or services may have limited quantities and are subject to return or exchange only according to our Money-Back Guarantee above. We reserve the right, but are not obligated, to limit the sales of our products or Services to any person, geographic region or jurisdiction, and to limit the quantities of any products or services we offer. All product descriptions and pricing are subject to change at any time without notice, at our sole discretion. Any offer for any product or service made on this site is void where prohibited.</p>

          <h2 id="sms">SMS communications</h2>
          <p>By providing your phone number and agreeing to receive messages, you authorize Just Jenny to send you informational and promotional text messages (for example order updates, reminders and offers). Consent is not a condition of purchase. Message frequency varies; message and data rates may apply. You can unsubscribe at any time by replying STOP or by emailing {mail}.</p>

          <h2 id="general">General conditions</h2>
          <h3>1. Online store terms</h3>
          <p>By agreeing to these Terms, you represent that you are at least the age of majority in your state or province of residence. You may not use our products for any illegal or unauthorized purpose, nor may you, in the use of the Service, violate any laws in your jurisdiction. A breach of any of the Terms will result in an immediate termination of your Services.</p>
          <h3>2. General conditions</h3>
          <p>We reserve the right to refuse service to anyone for any reason at any time. Credit card information is always encrypted during transfer over networks. You agree not to reproduce, duplicate, copy, sell, resell or exploit any portion of the Service without our express written permission.</p>
          <h3>3. Accuracy of information</h3>
          <p>We are not responsible if information made available on this site is not accurate, complete or current. The material on this site is provided for general information only. Any reliance on the material on this site is at your own risk.</p>
          <h3>4. Modifications to the Service and prices</h3>
          <p>Prices for our products are subject to change without notice. We reserve the right to modify or discontinue the Service (or any part of it) at any time without notice. We shall not be liable to you or any third party for any modification, price change, suspension or discontinuance of the Service.</p>
          <h3>5. Accuracy of billing and account information</h3>
          <p>We reserve the right to refuse any order. We may, in our sole discretion, limit or cancel quantities purchased per person, per household or per order. You agree to provide current, complete and accurate purchase and account information for all purchases and to promptly update your details, including your email address and card details, so we can complete your transactions and contact you as needed.</p>
          <h3>6. Third-party tools and links</h3>
          <p>We may provide access to third-party tools and links to third-party websites that we do not monitor or control. You acknowledge that we provide such access “as is” and “as available”, without warranties of any kind, and we have no liability arising from your use of them.</p>
          <h3>7. Personal information</h3>
          <p>Your submission of personal information through the store is governed by our <a href="https://getjustjenny.com/policies/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a>.</p>
          <h3>8. Errors, inaccuracies and omissions</h3>
          <p>Occasionally there may be information on our site that contains typographical errors, inaccuracies or omissions relating to product descriptions, pricing, promotions, offers, shipping charges, transit times and availability. We reserve the right to correct any errors, inaccuracies or omissions, and to change or update information or cancel orders if any information is inaccurate, at any time without prior notice (including after you have submitted your order).</p>
          <h3>9. Prohibited uses</h3>
          <p>You are prohibited from using the site or its content for any unlawful purpose, to infringe intellectual property rights, to harass or discriminate, to submit false or misleading information, to upload malicious code, to collect personal information of others, to spam, phish or scrape, or to interfere with the security features of the Service.</p>
          <h3>10. Disclaimer of warranties; limitation of liability</h3>
          <p>We do not guarantee that your use of our service will be uninterrupted, timely, secure or error-free. The service and all products delivered through it are (except as expressly stated by us) provided “as is” and “as available”, without any representation, warranties or conditions of any kind. In no case shall Just Jenny, {COMPANY}, our directors, officers, employees, affiliates, agents, contractors, suppliers, service providers or licensors be liable for any injury, loss, claim or any direct, indirect, incidental, punitive, special or consequential damages of any kind arising from your use of the service or any products procured using the service. Where a jurisdiction does not allow such exclusions, our liability shall be limited to the maximum extent permitted by law.</p>
          <h3>11. Indemnification</h3>
          <p>You agree to indemnify, defend and hold harmless Just Jenny, {COMPANY} and our affiliates, partners, officers, directors, agents, contractors, licensors, service providers, suppliers and employees from any claim or demand, including reasonable attorneys’ fees, made by any third party due to or arising out of your breach of these Terms or your violation of any law or the rights of a third party.</p>
          <h3>12. Severability, termination and entire agreement</h3>
          <p>If any provision of these Terms is determined to be unlawful, void or unenforceable, it shall be enforced to the fullest extent permitted by law and the unenforceable portion shall be severed without affecting the remaining provisions. These Terms are effective unless and until terminated by you or us. These Terms and any policies posted by us on this site constitute the entire agreement between you and us and supersede any prior agreements.</p>
          <h3>13. Changes to the Terms</h3>
          <p>You can review the most current version of the Terms at any time on this page. We reserve the right to update, change or replace any part of these Terms by posting updates on our website. Your continued use of the website or the Service after the posting of any changes constitutes acceptance of those changes.</p>

          <h2 id="contact">Contact</h2>
          <p>Questions about the Terms of Service and your membership should be sent to {mail}.</p>
          <p>{COMPANY} · {ADDRESS} · EIN {EIN}</p>
        </div>
        <p className="foot">© {new Date().getFullYear()} Just Jenny · {mail}</p>
      </div>
    </>
  );
}
