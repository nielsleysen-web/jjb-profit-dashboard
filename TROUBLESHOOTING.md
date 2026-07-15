# JJB Dashboard - Troubleshooting Guide

## Common Issues & Solutions

### 1. Login Page Appears But Password Doesn't Work

**Symptom:** You see the login page, enter your password, but it says "Invalid password"

**Causes:**
- Password in `NEXT_PUBLIC_PASSWORD` doesn't match what you're entering
- Typo or extra space in the password
- Browser cache issue

**Solutions:**
1. Double-check your password in Vercel:
   - Go to Vercel → Project Settings → Environment Variables
   - Find `NEXT_PUBLIC_PASSWORD`
   - Verify the exact value
2. Clear your browser cache:
   - Press Ctrl+Shift+Delete (Windows) or Cmd+Shift+Delete (Mac)
   - Clear browsing data
   - Reload the page
3. Try a different browser
4. If still broken, edit the password in Vercel and redeploy:
   - Change `NEXT_PUBLIC_PASSWORD` to something simple like `test123`
   - Click "Deploy"
   - Wait for "Ready" (green checkmark)
   - Try logging in with new password

---

### 2. Dashboard Shows $0 for All Metrics

**Symptom:** You successfully logged in, but all cards show 0 values

**Causes:**
- Meta or Shopify API credentials are invalid
- No actual orders or ad spend in the selected date range
- API endpoints failing silently

**Solutions:**
1. Check your date range:
   - Click "Custom" and select a date range you KNOW has orders
   - Try "Last 30 Days" to be sure
   
2. Verify Meta credentials:
   - Go to [business.facebook.com](https://business.facebook.com)
   - Click Settings → Users and Permissions → System Users
   - Find "jjbdashboard" system user
   - Check both accounts (1729, 2349) are assigned
   - Generate a NEW token with `ads_read` permission
   - Copy the full token (starts with `EAAW...`)
   - In Vercel, update `META_ACCESS_TOKEN` with the new token
   - Deploy and test
   
3. Verify Shopify credentials:
   - Go to Shopify Admin → Settings → Apps and integrations
   - Click "Develop apps"
   - Click your app
   - Check "API Credentials" tab for Client ID
   - In Vercel, verify:
     - `SHOPIFY_STORE_URL` matches your store (e.g., `justjenny.myshopify.com`)
     - `SHOPIFY_CLIENT_ID` matches exactly
   - Deploy and test

4. Check actual data in your systems:
   - Shopify: Do you have orders in the selected date range?
   - Meta: Do those accounts have ad spend in that period?

---

### 3. "Page Not Found" Error

**Symptom:** You get a 404 error or blank page

**Causes:**
- Files weren't uploaded correctly to GitHub
- Vercel build failed
- URL is wrong

**Solutions:**
1. Check your Vercel deployment status:
   - Go to Vercel Dashboard
   - Click your project
   - Check "Deployments" tab
   - If status is "Failed" (red), click it for error details
   - Fix the error and redeploy

2. Verify GitHub file structure:
   - Go to your GitHub repo
   - Check that you have:
     ```
     pages/
     ├── _app.js
     ├── index.js
     ├── dashboard.js
     ├── product-economics.js
     └── api/
         └── dashboard.js
     package.json
     ```
   - If files are missing or in wrong locations, re-upload them

3. Check your URL:
   - Should be: `https://jjb-profit-dashboard.vercel.app`
   - Not: `https://jjb-profit-dashboard.vercel.app/dashboard.html`
   - Not: `https://github.com/...`

---

### 4. Vercel Build Fails (Red Error)

**Symptom:** Deployment shows "Failed" with an error message

**Causes:**
- Syntax error in JavaScript files
- Missing dependencies in `package.json`
- Incorrect file structure

**Solutions:**
1. Click the failed deployment to see the error
2. Common errors:
   - **"Couldn't find any 'pages' directory"** → `pages/` folder missing. Re-upload files.
   - **"Cannot find module"** → Check `package.json` has all dependencies
   - **Syntax error in _app.js** → Make sure file wasn't corrupted during upload
3. If unclear, delete all files except `package.json` and re-upload the complete ZIP file
4. Click "Redeploy" in Vercel to try again

---

### 5. Products Table Shows "No sales in this period"

**Symptom:** Dashboard loads fine but products table is empty

**Causes:**
- No actual orders in Shopify for this date range
- Shopify API isn't returning order data
- COGS isn't configured

**Solutions:**
1. Verify you have orders in Shopify:
   - Go to Shopify Admin → Orders
   - Filter by date range matching your dashboard selection
   - If no orders exist, that's the issue
   
2. Try extending the date range:
   - Click "Custom"
   - Select a wider date range (e.g., last 90 days)
   - This ensures you have data to display

3. Check Shopify permissions:
   - Your Shopify app needs `read_orders` permission
   - Go to Shopify → Develop apps → Your app → Configuration
   - Verify `read_orders` is checked

---

### 6. Ad Spend Shows $0 But You Know You Spent Money

**Symptom:** Ad Spend card is empty or shows $0

**Causes:**
- Meta token is invalid or expired
- Ad accounts aren't properly assigned to system user
- Campaigns don't have spend in selected date range

**Solutions:**
1. Generate a new Meta token:
   - Go to [business.facebook.com](https://business.facebook.com)
   - Settings → Users and Permissions → System Users
   - Click "jjbdashboard"
   - Click "Generate Token"
   - Select both accounts (1729, 2349)
   - Select permissions: `ads_read`
   - Copy the full token
   - In Vercel, update `META_ACCESS_TOKEN`
   - Redeploy

2. Verify accounts are assigned:
   - Same page, check "Assigned Assets" section
   - Both accounts should be listed:
     - 1729 - 70221-getjustjenny-20-SMX
     - 2349 - 70221-getjustjenny-TNS10
   - If not, add them with "Manage" button

3. Check date range:
   - Your selected date range might not have spend
   - Try "Last 30 Days" to check

---

### 7. Sidebar Navigation Doesn't Show

**Symptom:** You're on the dashboard but the sidebar is missing

**Causes:**
- Not authenticated (but you'd see login page)
- CSS not loading
- Browser issue

**Solutions:**
1. Reload the page (Ctrl+R or Cmd+R)
2. Clear browser cache
3. Try a different browser
4. Check browser console for errors:
   - Press F12 (Developer Tools)
   - Go to "Console" tab
   - Look for red error messages
   - Copy the error and check API_DOCUMENTATION.md

---

### 8. Dashboard Loads Slow or Takes Forever

**Symptom:** Page takes 30+ seconds to load or times out

**Causes:**
- Shopify API is slow
- Meta API is slow or rate-limited
- Network issue

**Solutions:**
1. Try again in a few minutes (API rate limits reset)
2. Try a shorter date range (fewer queries)
3. Check Vercel logs:
   - Vercel Dashboard → Project → Functions
   - Look for `/api/dashboard` logs
   - Check execution time

---

### 9. "Error: META_ACCESS_TOKEN undefined"

**Symptom:** Dashboard shows an error about missing token

**Causes:**
- Environment variable not set in Vercel
- Vercel hasn't redeployed after setting the variable

**Solutions:**
1. Go to Vercel → Project Settings → Environment Variables
2. Verify `META_ACCESS_TOKEN` exists with a value starting with `EAAW`
3. If missing, add it
4. Click the deployment to redeploy
5. Wait for "Ready" status
6. Reload the dashboard

---

### 10. Can't Login - Says "Invalid password" Even With Correct Password

**Symptom:** You know your password is correct but it won't accept it

**Causes:**
- Browser autofill put wrong password in field
- Environment variable changed
- Vercel hasn't finished deploying latest version

**Solutions:**
1. Clear the password field completely
2. Type your password manually (don't use autofill)
3. Verify it in Vercel settings
4. If it's been a while since you deployed, redeploy:
   - Vercel Dashboard → Project
   - Click "Deployments"
   - Find latest deployment
   - Click "..." → "Redeploy"
   - Wait for "Ready"

---

## Still Having Issues?

### Debug Checklist

- [ ] Vercel deployment shows "Ready" (green checkmark)
- [ ] All environment variables are set and correct
- [ ] GitHub has all files in correct folder structure
- [ ] Browser cache is cleared
- [ ] You've tried in a different browser
- [ ] Your date range contains actual orders/spend
- [ ] API credentials were generated less than 90 days ago

### Where to Get Help

1. **Check API errors:** Press F12 → Console tab → look for error messages
2. **Check Vercel logs:** Vercel Dashboard → Functions tab
3. **Verify credentials:** Check they match across GitHub, Vercel, and your systems
4. **Reset everything:** Delete environment variables, re-add them, redeploy

