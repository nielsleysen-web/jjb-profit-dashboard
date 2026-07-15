import { useState } from "react";

export default function ProductEconomics() {
  const [searchTerm, setSearchTerm] = useState("");

  // Mock data - in production this would come from API
  const products = [
    {
      name: "Cerotto CircuMax",
      blended: "blended 30d (95 pgs)",
      price: "$32.65",
      cogs: "$7.42",
      fees: "$1.25",
      margin: "$23.98",
      sold30d: "1",
      breakeven: "1.56",
      profit10: "1.58",
      profit20: "1.87",
      variants: [
        { name: "1 (1u)", price: "$32.65", cogs: "$7.42", fees: "$1.25", margin: "$23.98", sold: 1, breakeven: 1.56, profit10: 1.58, profit20: 1.87 }
      ]
    },
    {
      name: "ArmLift",
      blended: "blended 30d (100 pgs)",
      price: "$32.65",
      cogs: "$8.03",
      fees: "$1.28",
      margin: "$23.37",
      sold30d: "1",
      breakeven: "1.40",
      profit10: "1.62",
      profit20: "1.94",
      variants: [
        { name: "1 (1u)", price: "$32.65", cogs: "$8.03", fees: "$1.28", margin: "$23.37", sold: 1, breakeven: 1.40, profit10: 1.62, profit20: 1.94 },
        { name: "2 (2u)", price: "$43.65", cogs: "$10.43", fees: "$1.56", margin: "$31.68", sold: 2, breakeven: 1.38, profit10: 1.60, profit20: 1.91 }
      ]
    }
  ];

  return (
    <div style={{ padding: "32px", background: "#f9fafb", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: "700", color: "#1f2937" }}>Product Economics</h1>
        <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>Target: needs per product from live Shopify prices and your COGS</p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: "24px" }}>
        <input
          type="text"
          placeholder="Search products by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: "10px 12px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "14px",
            width: "100%",
            maxWidth: "400px",
            boxSizing: "border-box"
          }}
        />
      </div>

      {/* Products */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
        {products.map((product, idx) => (
          <div key={idx} style={{ background: "white", padding: "24px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
            <h2 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: "600", color: "#1f2937" }}>
              ⭐ {product.name}
            </h2>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#6b7280" }}>
              {product.blended} | BE: 1.31 • 10%: 1.50 • 20%: 1.77
            </p>

            {/* Variants Table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Variant</th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Price</th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "#374151" }}>COGS</th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Fees</th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Margin</th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Sold 30d</th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "#374151" }}>Break-even</th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "#374151" }}>10% profit</th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "#374151" }}>20% profit</th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((variant, vidx) => (
                  <tr key={vidx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px", color: "#1f2937" }}>{variant.name}</td>
                    <td style={{ padding: "10px", color: "#1f2937" }}>{variant.price}</td>
                    <td style={{ padding: "10px", color: "#1f2937" }}>{variant.cogs}</td>
                    <td style={{ padding: "10px", color: "#1f2937" }}>{variant.fees}</td>
                    <td style={{ padding: "10px", fontWeight: "600", color: "#10b981" }}>{variant.margin}</td>
                    <td style={{ padding: "10px", color: "#1f2937" }}>{variant.sold}</td>
                    <td style={{ padding: "10px", color: "#3b82f6" }}>{variant.breakeven.toFixed(2)}</td>
                    <td style={{ padding: "10px", color: "#3b82f6" }}>{variant.profit10.toFixed(2)}</td>
                    <td style={{ padding: "10px", color: "#3b82f6" }}>{variant.profit20.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
