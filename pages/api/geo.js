// Land van de bezoeker op basis van het IP-adres (Vercel-header). Gebruikt door de salespagina's om de prijzen
// in de lokale munt te tonen (Cayenne: GB → £, CA/AU/NZ → eigen dollar). Geen persoonsgegevens, alleen de landcode.
export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "private, no-store");
  const country = String(req.headers["x-vercel-ip-country"] || "").toUpperCase().slice(0, 2);
  res.status(200).json({ country });
}
