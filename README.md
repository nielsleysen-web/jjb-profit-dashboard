# JJB Profit Dashboard

📊 **Just Jenny Beauty Profit Dashboard** — Real-time analytics combining Shopify orders with Meta ad spend to calculate product profitability.

## Features

- 📈 **Real-time Metrics** — Net profit, ROAS, AOV, and more
- 🛍️ **Product Performance** — Ranked by profitability with detailed breakdown
- 📱 **Responsive Design** — Works on desktop and mobile
- 🔐 **Secure** — Password-protected dashboard
- 🚀 **Fast** — Built on Next.js and hosted on Vercel
- 📊 **Multi-Account** — Tracks Meta accounts 1729 (SMX) and 2349 (TNS10)

## Dashboard Pages

### Dashboard
Main overview with:
- Summary cards (Total Orders, Net Profit, Revenue, etc.)
- Key metrics (ROAS, AOV, Ad Spend, COGS + Fees)
- Profit per Day chart
- Products ranked by profit table
- Date range selector (Today, 7d, 14d, 30d, Custom)

### Product Economics
Detailed product variant breakdown showing:
- Product pricing and COGS
- Margin calculations
- Units sold metrics
- ROAS targets for different profit margins

## Quick Start

### 1. Clone & Setup
```bash
git clone https://github.com/yourusername/jjb-profit-dashboard.git
cd jjb-profit-dashboard
npm install
cp .env.example .env.local
```

### 2. Get Your Credentials

**Meta Token:**
1. Go to business.facebook.com
2. Settings → Users and Permissions → System Users
3. Click "jjbdashboard" → Generate Token
4. Select accounts 1729 & 2349, `ads_read` permission
5. Copy token (starts with `EAAW...`)

**Shopify:**
1. Shopify Admin → Settings → Apps and integrations → Develop apps
2. Click your app → API Credentials
3. Copy Client ID

### 3. Environment Variables
```env
NEXT_PUBLIC_PASSWORD=your_password
META_ACCESS_TOKEN=EAAW...
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_CLIENT_ID=your_client_id
```

### 4. Deploy to Vercel
1. Push to GitHub
2. Go to vercel.com → Import your repo
3. Add environment variables
4. Deploy!

## Tech Stack
- Next.js 14 + React 18
- Vercel Hosting
- Meta Ads API + Shopify Admin API
- Inline CSS (no dependencies)

## Documentation
- **SETUP_GUIDE.md** — Complete setup instructions
- **API_DOCUMENTATION.md** — API reference
- **TROUBLESHOOTING.md** — Common issues & solutions

## Support
1. Check TROUBLESHOOTING.md
2. Review API_DOCUMENTATION.md
3. Check browser console (F12)
4. Check Vercel logs

---

**Ready to deploy?** Follow the Quick Start section above! 🚀
