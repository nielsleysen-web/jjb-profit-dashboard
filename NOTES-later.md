
## Later (na portaal-bouw) — 28 sep
- ALLE Klaviyo-mails (1–8) opnieuw doen zodra het portaal klaar is: aanpassen aan de definitieve portaalflow, incl. magic-login-link en/of wachtwoord dat in de eerste mail wordt meegestuurd. Ook "elk product 1× per cycle" nog eens nalezen in de definitieve versies.
- Rebill-mails ("your free items are ready again") + transactionele mails (verzendbevestiging, rebill-ontvangst, opzegging) nog te maken.
- Portaal-mails m1 (login link) en m2 (bevestiging) nog naar Italiaans.
- REGEL: technische/transactionele mails (login link, orderbevestiging portaal, verzending, rebill, opzegging…) → bovenaan ALLEEN het logo. Geen "40.000+ clienti soddisfatti"-pill en geen garantie-balk.
- REGEL: nooit copy of inhoud van mails wijzigen zonder expliciete toestemming van Niels. Alleen doorvoeren wat gevraagd is; voorstellen eerst vragen.

## Tinnitus Library (30 sep)
- E-book 1 KLAAR en goedgekeurd: "NeuroTone — Come ottenere i migliori risultati con le gocce" (design/library/01-neurotone-6-giorni.pdf, cover van Niels 01-cover.png, generator 01-build.py).
- Reeks (≤30 p., IT, pictogrammen, simpele taal): 2) Proteggere l'udito ogni giorno · 3) I suoni che peggiorano l'acufene · 4) Per il partner: cosa sta vivendo chi ha l'acufene.
- Nog te bouwen in portaal: BOOKS[] vullen + downloadmechanisme (1 per cyclus), pdf's in public/portal/library/.
- Mail 1: membership-afbeelding via Shopify Files (files/membership-card.png); link controleren na upload.

## Membership-dashboard: omzet vs. hoofddashboard (30/09)
- Membership-dashboard telt alleen orders met tag `subscription-frontend` + stripe/paypal_subscription. Eenmalige orders uit de A/B-variant (pagina 5077313) blijven buiten beeld, maar de ad spend van die campagnes telt wél volledig mee → netto winst/ROAS tijdelijk te negatief.
- Besluit Niels: laten staan; vanaf zaterdag 3/10 gaat alle verkeer naar de membership-checkout, dan klopt het vanzelf. (Optie voor later: spend pro rata toerekenen.)

## Post-purchase upsell 1+1 gratis (1/10)
- Pagina /checkout/offerta (IT) tussen betaling en /checkout/grazie; checkout.js SUCCESS_PATH → /checkout/offerta.
- Stripe: POST /api/stripe/upsell → off-session PaymentIntent €29,95 op de bewaarde betaalmethode (idempotency jjup_<sub>), 3DS via Stripe.js; PayPal: /api/paypal/upsell create/capture met PayPal-knop.
- Order: lib/upsell.js → orderEdit (variant 1x × 2, regelkorting tot €29,95, commit zonder mail, markAsPaid, tag upsell-1plus1). Webhook-fallback als de order nog niet bestond (metadata upsell_pi/upsell_order).
- Vereist Shopify-scopes read_order_edits + write_order_edits. Aanbod 2 uur geldig (UPSELL.windowMin).
- Open: kleine race webhook↔upsell-route (beide kunnen tegelijk toevoegen); in de praktijk zeldzaam, check tag upsell-1plus1 bij twijfel.

## Deactivatie bij opzegging / mislukte rebill (1/10)
- isDeactivated(member, sub) in lib/portal-account.js: Stripe canceled/past_due/unpaid, PayPal CANCELLED/EXPIRED/SUSPENDED, of member.status cancelled.
- Overview geeft deactivated + deactivatedReason; portaal toont alleen components/portal/Reactivate.js (geen tabs, geen banner). API's claim, library/unlock en library/file weigeren (403 "ended" / redirect).
- Heractiveren: /api/portal/reactivate. Stripe: SetupIntent → kaart → past_due: open factuur innen op dezelfde sub; opgezegd: nieuw abonnement €49/28d zonder proef (metadata kind=reactivation → webhook maakt géén Shopify-order). PayPal: plan "JJ membership riattivazione" zonder setup fee/proef, return /riattiva?pp=1&subscription_id= → paypal_confirm.
- Klaviyo-events: "Membership Payment Failed" (Stripe invoice.payment_failed, PayPal SUSPENDED/PAYMENT.FAILED) met portal_url → flow nog aan te maken in Klaviyo; "Membership Reactivated" bij succes.
- Stripe webhook: invoice.payment_failed en customer.subscription.deleted moeten aanstaan (events-lijst van de endpoint checken). PayPal webhook: BILLING.SUBSCRIPTION.SUSPENDED + PAYMENT.FAILED toevoegen aan de webhook in PayPal.

## Upsell fix (1/10)
- Eigen Shopify-product "NeuroTone Drops · Offerta 1+1 (2 flaconi)" (gid://shopify/Product/10654101405962, variant 53842294735114, €29,95, SKU JJ-NEUROTONE-UPSELL-2, draft, tags upsell/portal-only, inventory CONTINUE). lib/upsell.js voegt die variant toe (geen korting meer).
- Stripe: betaalmiddel wordt eerst aan de klant gekoppeld (attach) vóór de off-session charge; echte foutcode in Vercel-log "stripe/upsell charge:".
- Bedankpagina toont de upsell-regel (order-tag upsell-1plus1 of ?up=1) en telt mee in subtotaal/totaal.
- Klaviyo-event "Upsell Added" (order_name, amount, compare_at, product_image, first_name) → mail emails/portal/m4-offerta-1plus1-aggiunta-it-klaviyo.html; flow nog aanmaken in Klaviyo.

## Upsell → mail 1 (30 sep)
- Mail 1 ("Started Membership") wordt vastgehouden tot de klant de upsellpagina verlaat (lib/upsell-gate.js, Redis `portal:mail1:*`).
  Ja → upsell_added=true + regel "1+1 GRATIS (2 Flaconi)" in de ordertabel; nee/doorgaan → zonder; pagina gesloten → cron /api/checkout/mail1-flush na 30 min.
- Beslissing vóór de webhook (klant snel klaar) wordt onthouden (`:decided`) en bij de hold meteen verwerkt.
- emails/portal/m4-offerta-1plus1-aggiunta-it-klaviyo.html is NIET meer nodig (geen aparte upsell-mail); event "Upsell Added" blijft bestaan voor rapportage, er hoeft geen flow op.
- Stripe-upsell: idempotency key per poging (`jjup_<sub>_<n>`), kaart/wallet-type in de foutlog. Live fouten gezien: incorrect_number (2x, 17:42) en card_declined (17:46).

## Upsell niet op Shopify-order (2 okt)
- Oorzaak gevonden via `merchantEditableErrors`: "This order cannot be edited by this app" → een order mag alleen bewerkt
  worden door de app die hem aanmaakte (Profit Dashboard) → die app heeft `write_order_edits` + `read_order_edits` nodig.
- Vangnet: lib/upsell-queue.js (Redis-wachtrij + Stripe-search sweep), cron /api/checkout/sweep (vervangt mail1-flush).
  Na betaling krijgt de klant altijd succes; koppelen aan de order mag later. Webhook bewaart nu ook shopify_order_id (gid).
- Twee openstaande: #2360 (octy@tiscali.it, pi_3ULlRNQolGRbegLL0OayypkJ) en #2348 (ubert2010@libero.it, pi_3ULeGZQolGRbegLL1MxoEBrG);
  de sweep pakt ze op zodra de scope goed staat.
- Vercel = Hobby → cron max 1x/dag (`*/10` laat de build mislukken). Sweep nu dagelijks 05:20 UTC + sweepIfDue() op
  verkeer (bedankpagina-endpoints en "No grazie"), Redis-slot max 1x per 5 min. Vercel deployde niets meer sinds d7bff87
  (1 okt 11:14) → git-koppeling van het project controleren / Deploy Hook.

## Termini + membership-pagina (2 okt)
- /checkout/termini (Vena Corporate LLC, WY-recht, membership-termen, garanzia 90 giorni = alleen ongeopend, SMS kort) en
  /checkout/membership (publieke uitlegpagina, geen knoppen/links naar het ledenplatform). Beide goedgekeurd door Niels.
- Checkout: ALLEEN de twee href's onder de bestelknop gewijzigd (→ /checkout/termini en /checkout/membership). Tekst,
  mails, garantie-copy: niets aangeraakt — vaste regel van Niels.

## Regalo bij heractivering (2 okt)
- lib/portal-regift.js: na reactivatie met reden payment_failed (reactivate.js, `gift: pastDue`) → extra e-book naar keuze
  (bonus in portal-library) + 9,95 € tegoed op de S&H-fee van één product (portal-claim: fee = shipping − credit; fee 0 →
  order zonder betaling, provider "regalo"). Overview geeft `regift` + `shippingAfterGift`; UI: kader "I tuoi regali",
  badge op kaartjes, kortingsregel in de samenvatting. Event "Membership Reactivated" krijgt `gift: true/false` (mail m6).
- Klaviyo-flows live: Failed Payment (m5 direct, m5b na 3 dagen als niet geheractiveerd), Reactivated (m6).

## Members-pagina (2 okt)
- /members (dashboard, Finance/Admin) + /api/members: Redis-ledenrecords + live /api/subscriptions (Stripe/PayPal) + Shopify
  portal-order/upsell-tags. Tellers: nooit ingelogd · ingelogd zonder bestelling · proef < 48 u zonder login · product besteld.
- lib/portal-activity.js: recordLogin (verify/login), recordPasswordSet, touchSeen (overview, max 1x/10 min), logEvent →
  portal:log:<email> (registered, login, password_set, claim, ebook, rebill, cancelled, reactivated). Historie start bij deploy.
- markRenewed telt nu rebills/totalPaid op het record.

## Membership Dashboard = rebill-dashboard (3 okt)
- Bovenkant van /subscriptions vervangen door het rebill-design: grafiek (groen = totale omzet front end + rebills, blauw = rebills; bij één dag per uur met de dag ervoor gestippeld en ▲ voor wat vandaag nog gepland staat), 4 grote tegels (Rebills, Totale netto winst, Netto rebill-winst, Rebill-omzet), 5 kleine (Succes-%, Mislukt, Te innen, Komende 7 dagen, MRR), tabel "Rebills — per cyclus" en de lijst "Rebills <periode>" (geslaagd/mislukt met decline-code/gepland). Cohort-retentie en de ledenlijst ongewijzigd. "Drop-off per cyclus" is vervangen door de per-cyclus-tabel.
- Totale netto winst = front end + rebills − COGS − fees − ad spend (zelfde definitie als de oude tegel "Netto winst (incl. rebills)"). Netto rebill-winst = rebills − betaalfees − MEMBERSHIP_REBILL_COGS per rebill.
- API: invoices.list met expand payment_intent (decline_code), `recovered` = betaald na >1 poging; nieuwe velden compare, chart, cycleRows, events, kpis.due/next7/rebillNet/frontEnd.
- Vervallen tegels (Winstpercentage, Orders, Subscription ROAS, Dag 7 LTV, Churn, Opzeggingen, Actieve abonnees) zitten deels in de subteksten; terugzetten kan als gewenst.
- /members?email=… opent meteen de tijdlijn van dat lid (link vanuit de rebill-lijst).
