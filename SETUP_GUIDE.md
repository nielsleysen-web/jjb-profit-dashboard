# JJB Profit Dashboard - Complete Setup Guide

## Overview

Just Jenny Beauty Profit Dashboard is a web application that tracks ad spend from Meta (Facebook/Instagram) and integrates with Shopify order data to calculate profit metrics across your product line.

**Current Status:** Production Ready  
**Version:** 1.0.0  
**Tech Stack:** Next.js, React, Vercel

---

## Features

### Dashboard Page
- **Total Orders** — Orders from Shopify in selected date range
- **Net Profit** — Revenue - COGS - Ad Spend (displayed prominently in green)
- **Revenue** — Total sales from Shopify
- **Profit %** — Net Profit as percentage of Revenue
- **Blended ROAS** — Return on Ad Spend across Meta accounts
- **Avg Order Value** — Revenue / Total Orders
- **COGS + Fees** — Cost of goods sold plus payment fees
- **Ad Spend (Meta)** — Total spending from Meta ad accounts
- **Profit Per Day Chart** — Visual breakdown of daily profit trends
- **Products Table** — Each product ranked by profitability with columns: Product Name, ROAS, Orders, Revenue, COGS, Ad Spend, Profit

### Product Economics Page
- Detailed product variant breakdown
- Price, COGS, fees, and margin per variant
- Units sold in last 30 days
- Break-even ROAS calculations
- 10% and 20% profit target ROAS calculations

### Navigation
- Sidebar with links to Dashboard and Product Economics
- Login/Logout functionality
- Password-protected access

---

## Installation & Deployment

### Prerequisites
- GitHub account
- Vercel account (free tier works)
- Shopify store with admin access
- Meta Business account with ad accounts

### Step 1: GitHub Setup

1. Create a new GitHub repository called `jjb-profit-dashboard`
2. Upload all files from the ZIP package to your repository:
   - `pages/` folder (with all React components)
   - `package.json`
   - `.env.example`

Your repository structure should look like:
```
jjb-profit-dashboard/
├── pages/
│   ├── _app.js
│   ├── index.js
│   ├── dashboard.js
│   ├── product-economics.js
│   └── api/
│       └── dashboard.js
├── package.json
└── .env.example
```

### Step 2: Vercel Deployment

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. On the "New Project" page, fill in Environment Variables:

**Environment Variables to Add:**

| Key | Value | Description |
|-----|-------|-------------|
| `NEXT_PUBLIC_PASSWORD` | Your secure password | Login password for dashboard |
| `META_ACCESS_TOKEN` | Your Meta token (EAAW...) | Token with ads_read permission on accounts 1729 & 2349 |
| `SHOPIFY_STORE_URL` | your-store.myshopify.com | Your Shopify store domain |
| `SHOPIFY_CLIENT_ID` | Your Client ID | From Shopify Dev App |

5. Click "Deploy"
6. Wait for deployment to complete (status shows "Ready" - green checkmark)

### Step 3: Access Your Dashboard

Once deployment is complete:
1. Visit your Vercel project URL (usually `jjb-profit-dashboard.vercel.app`)
2. You'll see the login page
3. Enter your `NEXT_PUBLIC_PASSWORD`
4. You're in! 🎉

---

## Getting Your API Credentials

### Meta Access Token

1. Go to [business.facebook.com](https://business.facebook.com)
2. Settings → Users and Permissions → System Users
3. Find or create "jjbdashboard" system user
4. Verify both accounts are assigned (1729 SMX, 2349 TNS10)
5. Click "Generate New Token"
6. Select both accounts and `ads_read` permission
7. Copy the token (starts with `EAAW...`)

### Shopify Credentials

1. Go to your Shopify Admin → Settings → Apps and integrations
2. Click "Develop apps"
3. Select or create your app
4. Go to "Configuration" tab
5. Under Admin API access scopes, enable:
   - `read_orders`
   - `read_products`
   - `read_fulfillments`
6. Click "Save"
7. Go to "API Credentials" tab
8. Copy the `Client ID`

---

## File Structure Explained

### pages/_app.js
The main app wrapper that handles:
- User authentication (login/logout)
- Session management
- Sidebar navigation between pages
- Global styling

### pages/index.js
Simple home page that redirects to the dashboard

### pages/dashboard.js
Main dashboard displaying:
- Summary cards with key metrics
- Date range selector (Today, 7d, 14d, 30d, Custom)
- Product performance table

### pages/product-economics.js
Detailed view of product variants showing:
- Pricing breakdown
- Margin calculations
- ROAS targets for different profit margins

### pages/api/dashboard.js
Backend API endpoint that:
- Fetches Shopify order data
- Fetches Meta ad spend data
- Calculates profit metrics
- Combines and returns all data to frontend

---

## How It Works

### Data Flow

1. **Dashboard loads** → User clicks date range
2. **API call** → `GET /api/dashboard?range=7d`
3. **Shopify API call** → Fetches orders in date range
4. **Meta API call** → Fetches ad spend from accounts 1729 & 2349
5. **Calculations** → Computes profit, ROAS, AOV, etc.
6. **Response** → Returns all data to frontend
7. **Rendering** → Dashboard displays metrics and products table

### Key Metrics

- **Profit** = Revenue - COGS - Ad Spend
- **Profit %** = (Profit / Revenue) × 100
- **ROAS** = Revenue / Ad Spend (if Ad Spend > 0)
- **AOV** = Revenue / Order Count
- **Cost per Order** = Ad Spend / Order Count

---

## Customization

### Changing the Password
1. Go to Vercel → Project Settings → Environment Variables
2. Find `NEXT_PUBLIC_PASSWORD` and edit it
3. Save
4. Vercel automatically redeploys

### Adding New Metrics
Edit `pages/api/dashboard.js` to add new calculations or `pages/dashboard.js` to add new cards

### Styling
All styling is inline in the React components. Colors use standard web colors:
- Primary: `#3b82f6` (blue)
- Success: `#10b981` (green)
- Danger: `#ef4444` (red)
- Text: `#1f2937` (dark)
- Background: `#f9fafb` (light)

---

## Troubleshooting

### Dashboard shows $0 for all metrics
- Check that Meta and Shopify tokens are correct in Vercel
- Verify tokens have proper permissions
- Check that the date range has actual orders/spend

### Login page shows but password doesn't work
- Double-check your `NEXT_PUBLIC_PASSWORD` environment variable
- Verify there are no spaces or special characters causing issues
- Redeploy after changing the password

### Products table is empty
- Verify Shopify API credentials are correct
- Check that the date range has actual orders in your store

### Build fails on Vercel
- Ensure all files are in the correct folder structure
- Check that `package.json` is in the root directory
- Clear Vercel cache and redeploy

---

## Support & Next Steps

1. **Test the dashboard** with your actual data
2. **Customize** styling or add new metrics as needed
3. **Share the URL** with your team (they'll need the password)
4. **Monitor** Vercel deployments for any errors

For questions or issues, check the troubleshooting section above or review the code comments in each file.

---

**Dashboard is now live!** 🚀
