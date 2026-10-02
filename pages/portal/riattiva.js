// pages/portal/riattiva.js — PayPal stuurt het lid hierheen na goedkeuring van de heractivering
// (?pp=1&subscription_id=I-…). De portaalpagina rondt het af (Reactivate leest de query).
import { useEffect } from "react";
import { go } from "../../components/portal/AuthShell";
export default function Riattiva() {
  useEffect(() => { go(`/${window.location.search}`); }, []);
  return null;
}
