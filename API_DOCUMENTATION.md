# JJB Dashboard API Documentation

## Overview

The JJB Dashboard has a single main API endpoint that aggregates data from Shopify and Meta.

---

## Dashboard Data Endpoint

### GET /api/dashboard

Fetches aggregated dashboard data combining Shopify orders and Meta ad spend.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `range` | string | `7d` | Date range: `1d`, `7d`, `14d`, `30d`, or `custom` |
| `dateFrom` | string | - | Optional: YYYY-MM-DD format |
| `dateTo` | string | - | Optional: YYYY-MM-DD format |

#### Example Requests

```
GET /api/dashboard?range=7d
GET /api/dashboard?range=30d
GET /api/dashboard?dateFrom=2026-07-01&dateTo=2026-07-15
```

#### Response

```json
{
  "success": true,
  "data": {
    "totalOrders": 7,
    "ordersChange": 133.3,
    "revenue": 700.00,
    "revenueChange": 156.45,
    "cogsAndFees": 320.00,
    "cogsPercent": 35,
    "feesPercent": 5,
    "avgOrderValue": 100.00,
    "aovChange": 10.0,
    "adSpend": 150.00,
    "roas": 4.67,
    "netProfit": 230.00,
    "profitChange": 12.5,
    "profitPercent": 32.86,
    "profitPercentChange": 2.3,
    "adSpendPercent": 21.43,
    "products": [
      {
        "name": "Cerotto CircuMax",
        "orders": 4,
        "revenue": 239.58,
        "cogs": 47.16,
        "adSpend": 0,
        "profit": 184.27,
        "roas": 0
      },
      {
        "name": "ArmLift",
        "orders": 2,
        "revenue": 152.30,
        "cogs": 25.87,
        "adSpend": 45.00,
        "profit": 81.43,
        "roas": 3.39
      }
    ]
  },
  "dateFrom": "2026-07-08",
  "dateTo": "2026-07-15",
  "timestamp": "2026-07-15T14:29:00Z"
}
```

#### Response Fields

**Overview Metrics:**
- `totalOrders` (number) - Total orders in date range
- `ordersChange` (number) - % change vs previous period
- `revenue` (number) - Total revenue in USD
- `revenueChange` (number) - % change vs previous period
- `cogsAndFees` (number) - Total COGS + payment fees
- `cogsPercent` (number) - COGS as % of revenue
- `feesPercent` (number) - Fees as % of revenue
- `avgOrderValue` (number) - Average order value
- `aovChange` (number) - % change vs previous period

**Profitability:**
- `adSpend` (number) - Total Meta ad spend
- `roas` (number) - Return on Ad Spend (Revenue / Ad Spend)
- `netProfit` (number) - Revenue - COGS - Fees - Ad Spend
- `profitChange` (number) - % change vs previous period
- `profitPercent` (number) - Profit as % of revenue
- `profitPercentChange` (number) - % point change vs previous period
- `adSpendPercent` (number) - Ad spend as % of revenue

**Products:**
- `products` (array) - Array of product objects:
  - `name` (string) - Product name
  - `orders` (number) - Orders for this product
  - `revenue` (number) - Revenue from this product
  - `cogs` (number) - COGS for this product
  - `adSpend` (number) - Ad spend matched to this product
  - `profit` (number) - Revenue - COGS - Ad Spend
  - `roas` (number) - ROAS for this product

---

## Environment Variables

The API requires these environment variables to function:

```
META_ACCESS_TOKEN=EAAW...
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_CLIENT_ID=your_client_id_here
```

---

## Error Handling

### Error Response

If an error occurs, the API returns:

```json
{
  "success": false,
  "error": "Description of what went wrong"
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Failed to fetch Meta data" | Invalid Meta token or network error | Verify `META_ACCESS_TOKEN` in Vercel |
| "Failed to fetch Shopify data" | Invalid Shopify credentials | Verify `SHOPIFY_STORE_URL` and `SHOPIFY_CLIENT_ID` |
| "No data in date range" | No orders or spending in selected dates | Try a longer date range |

---

## Rate Limiting

- Meta API: Subject to Meta's rate limits (typically 200 calls/hour)
- Shopify API: Subject to Shopify's rate limits (typically 40 calls/second)

No artificial rate limiting is applied by JJB Dashboard.

---

## Caching

Currently, the API makes a fresh call every time. For production with high traffic, consider:
1. Implementing Redis caching
2. Adding 5-minute cache TTL
3. Storing daily snapshots

---

## Implementation Notes

### Shopify Integration

The endpoint queries Shopify for:
- Orders created in the date range
- Order total (including shipping, taxes)
- Line items (products, quantities, prices)
- Fulfillment status

COGS is calculated from:
- Configured COGS value per product
- Or estimated from order data

### Meta Integration

The endpoint queries Meta for:
- Ad account 1729 (SMX)
- Ad account 2349 (TNS10)
- Metrics: spend, impressions, clicks, conversions

Campaigns are matched to products by campaign name pattern:
- Campaign name should include product name or SKU
- Example: "CircuMax - 10% DC" matches "Cerotto CircuMax"

---

## Future Enhancements

- [ ] Add product variant breakdown
- [ ] Add customer LTV calculations
- [ ] Add cohort analysis (by acquisition channel)
- [ ] Add forecasting based on historical trends
- [ ] Add export to CSV/PDF
- [ ] Add scheduled reports via email

