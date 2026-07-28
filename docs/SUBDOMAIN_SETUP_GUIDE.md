# Subdomain Setup Guide for Admin and Vendor Portals

This guide will help you set up subdomains for your admin and vendor portals using Hostinger DNS and Vercel hosting.

## Overview

After setup, you'll have:
- **Main Website**: `opusfestaevents.com` (or your domain)
- **Admin Portal**: `admin.opusfestaevents.com`
- **Vendor Portal**: `vendors.opusfestaevents.com` (or `vendor.opusfestaevents.com`)

## Prerequisites

- Domain registered with Hostinger
- Vercel account with your projects deployed
- Access to Hostinger DNS management panel

---

## Step 1: Configure Next.js Apps for Subdomains

Since we're using subdomains instead of paths, we need to remove the `basePath` configuration.

### 1.1 Update Admin Next.js Config

The `basePath: '/admin'` needs to be removed from `apps/admin/next.config.mjs`:

```javascript
// Remove or comment out: basePath: '/admin',
```

### 1.2 Update Vendor Portal Next.js Config

The `basePath: '/vendors'` needs to be removed from `apps/vendor-portal/next.config.js`:

```javascript
// Remove or comment out: basePath: '/vendors',
```

---

## Step 2: Configure DNS in Hostinger

### 2.1 Access Hostinger DNS Management

1. Log in to your Hostinger account
2. Go to **Domains** → Select your domain (e.g., `opusfestaevents.com`)
3. Click on **DNS / Name Servers** or **DNS Zone Editor**

### 2.2 Add CNAME Records for Subdomains

You need to add two CNAME records pointing to Vercel:

#### For Admin Portal:
- **Type**: CNAME
- **Name/Host**: `admin` (or `admin.opusfestaevents.com` depending on Hostinger's interface)
- **Value/Target**: `cname.vercel-dns.com`
- **TTL**: 3600 (or leave default)

#### For Vendor Portal:
- **Type**: CNAME
- **Name/Host**: `vendors` (or `vendors.opusfestaevents.com`)
- **Value/Target**: `cname.vercel-dns.com`
- **TTL**: 3600 (or leave default)

**Note**: Some Hostinger interfaces might require you to enter just `admin` or `vendors` in the name field, while others might require the full subdomain. Check your interface.

### 2.3 Verify DNS Records

After adding the records, you should see:
```
Type    Name          Value
CNAME   admin         cname.vercel-dns.com
CNAME   vendors       cname.vercel-dns.com
```

**Important**: DNS propagation can take 48-72 hours, but usually happens within a few minutes to a few hours.

---

## Step 3: Configure Domains in Vercel

**Quick Check: Do your projects exist in Vercel?**

Before adding domains, make sure both projects are deployed in Vercel:
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Check your projects list - you should see:
   - Your admin project (might be named `opusfesta-admin` or similar)
   - Your vendor portal project (might be named `opusfesta-vendor-portal` or similar)
   - Your main website project

If a project is missing, you'll need to deploy it first (see Step 3.2 for instructions).

### 3.1 Add Domain to Admin Project

**Detailed Navigation Steps:**

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) and log in
2. **Important**: Check the top-left corner - make sure you're in the correct **Team/Workspace**
   - If you have multiple teams, select the one where your projects are deployed
   - The team name appears in a dropdown at the top-left
3. In the **Projects** list (main dashboard page), click on your **Admin project**
   - Project names might be: `opusfesta-admin`, `admin`, `opusfesta-admin-portal`, etc.
   - If you can't find it, use the search bar at the top to search for "admin"
4. Once inside the project page, look for the **horizontal navigation tabs** at the top:
   - You should see tabs like: **Deployments**, **Analytics**, **Settings**, **Storage**, etc.
5. Click on the **Settings** tab (usually the rightmost tab or near the end)
6. In the **left sidebar** (under Settings), you'll see a menu with options like:
   - General
   - Environment Variables
   - Git
   - Domains ← **This is what you're looking for!**
   - Functions
   - etc.
7. Click on **"Domains"** in the left sidebar
   - If you don't see it, scroll down in the sidebar - it's usually below "Git" or "Environment Variables"
8. On the Domains page, you should see:
   - A list of existing domains (if any)
   - A button that says **"Add Domain"**, **"Add"**, or **"Add Custom Domain"** - click it
9. In the popup/modal that appears, enter: `admin.opusfestaevents.com` (replace with your actual domain)
10. Click **Add**, **Continue**, or **Save**

**If you still can't find "Domains":**
- Try this direct URL pattern: `https://vercel.com/[your-team]/[project-name]/settings/domains`
- Or look for **"Project Settings"** → **"Domains"**
- Some Vercel interfaces show it under **"Configuration"** → **"Domains"**

### 3.2 Add Domain to Vendor Portal Project

**Detailed Navigation Steps:**

1. Go back to the [Vercel Dashboard](https://vercel.com/dashboard)
   - Or click the Vercel logo/icon at the top to return to the main dashboard
2. In the **Projects** list, click on your **Vendor Portal project**
   - Project names might be: `opusfesta-vendor-portal`, `vendor-portal`, `vendors`, etc.
   - Use the search bar if you can't find it
   - **If the project doesn't exist yet**, you'll need to create it first (see "Creating a New Project" below)
3. Once inside the project, click on the **Settings** tab (top navigation)
4. In the **left sidebar** under Settings, scroll down and click on **"Domains"**
5. Click the **"Add Domain"**, **"Add"**, or **"Add Custom Domain"** button
6. In the input field, enter: `vendors.opusfestaevents.com` (replace with your actual domain)
7. Click **Add**, **Continue**, or **Save**

**If the Vendor Portal project doesn't exist yet:**

1. In Vercel Dashboard, click **"Add New..."** → **"Project"**
2. Import your repository (e.g., `borismassesa/thefesta`)
3. Configure the project:
   - **Project Name**: `opusfesta-vendor-portal` (or any name)
   - **Root Directory**: `apps/vendor-portal`
   - **Framework**: Next.js (auto-detected)
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Install Command**: `cd ../.. && npm install`
4. Add environment variables (same as your other projects)
5. Deploy the project
6. Then follow steps above to add the domain

### 3.3 Verify Domain Configuration

Vercel will show you the DNS records needed. Since you've already added the CNAME records in Hostinger, Vercel should detect them automatically.

**Verification Status**:
- ✅ **Valid Configuration**: Green checkmark - DNS is correctly configured
- ⏳ **Pending**: DNS is still propagating (wait a few minutes to hours)
- ❌ **Invalid Configuration**: Check that your CNAME records match exactly

---

## Step 4: Update Vercel Configuration Files

### 4.1 Remove Rewrites from Website vercel.json

Since we're using subdomains, we no longer need the rewrites in `apps/website/vercel.json`. Remove or comment out the rewrites section:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "installCommand": "cd ../.. && npm install"
  // Remove the rewrites section - no longer needed with subdomains
}
```

### 4.2 Keep Admin and Vendor Portal vercel.json Simple

The `apps/admin/vercel.json` and `apps/vendor-portal/vercel.json` files should remain simple (no rewrites needed):

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "installCommand": "cd ../.. && npm install"
}
```

---

## Step 5: Update Environment Variables (if needed)

If your apps reference the domain in environment variables or configuration, update them:

- `NEXT_PUBLIC_APP_URL` → `https://admin.opusfestaevents.com` (for admin)
- `NEXT_PUBLIC_APP_URL` → `https://vendors.opusfestaevents.com` (for vendor portal)

Check your apps for any hardcoded domain references that need updating.

---

## Step 6: Test Your Subdomains

### 6.1 Check DNS Propagation

Use online tools to verify DNS propagation:
- [whatsmydns.net](https://www.whatsmydns.net/)
- [dnschecker.org](https://dnschecker.org/)

Enter your subdomains:
- `admin.opusfestaevents.com`
- `vendors.opusfestaevents.com`

Look for CNAME records pointing to `cname.vercel-dns.com`.

### 6.2 Test in Browser

Once DNS has propagated:
- Visit `https://admin.opusfestaevents.com`
- Visit `https://vendors.opusfestaevents.com`

Both should load your Vercel-deployed applications.

---

## Troubleshooting

### Can't Find "Domains" in Vercel Dashboard

**Common Issues and Solutions:**

1. **Wrong Project Selected**
   - Make sure you're inside the correct project (not on the main dashboard)
   - Click on the project name in the projects list first

2. **Domains Section Not Visible**
   - Scroll down in the Settings sidebar - "Domains" might be below the fold
   - Look for it under different names: "Custom Domains", "Domain Settings", or "Domains & SSL"
   - Try the direct URL: `https://vercel.com/[your-team]/[project-name]/settings/domains`
   - Replace `[your-team]` with your team/username and `[project-name]` with your project name

3. **Project Doesn't Exist**
   - If you can't find the vendor portal project, you need to create it first
   - See "Creating a New Project" section in Step 3.2 above

4. **Using Vercel CLI (Alternative Method)**
   
   If you can't find the Domains section in the UI, you can use the Vercel CLI:
   
   ```bash
   # Install Vercel CLI if you haven't
   npm i -g vercel
   
   # Login to Vercel
   vercel login
   
   # Navigate to your project directory
   cd apps/admin
   
   # Link to your project (if not already linked)
   vercel link
   
   # Add domain for admin
   vercel domains add admin.opusfestaevents.com
   
   # For vendor portal
   cd ../vendor-portal
   vercel link
   vercel domains add vendors.opusfestaevents.com
   ```

5. **Check Vercel Plan**
   - Some Vercel plans might have domain management in different locations
   - Free tier supports custom domains, but the UI might vary

6. **Try Different Browser/Incognito**
   - Sometimes browser cache can hide UI elements
   - Try incognito/private mode or a different browser

### DNS Not Propagating

1. **Wait**: DNS can take up to 72 hours (usually much faster)
2. **Clear DNS Cache**: 
   - macOS: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
   - Windows: `ipconfig /flushdns`
3. **Check Record**: Verify CNAME records are exactly `cname.vercel-dns.com`

### Vercel Shows "Invalid Configuration"

1. **Check CNAME Value**: Must be exactly `cname.vercel-dns.com` (no trailing dot, no www)
2. **Check Subdomain Name**: Should match exactly what you entered in Vercel
3. **Wait for Propagation**: Sometimes Vercel needs a few minutes to detect changes

### SSL Certificate Issues

Vercel automatically provisions SSL certificates via Let's Encrypt. If you see SSL errors:
1. Wait 5-10 minutes after adding the domain
2. Check Vercel dashboard for SSL certificate status
3. Ensure DNS is correctly configured

### App Not Loading Correctly

1. **Check basePath**: Ensure `basePath` is removed from Next.js configs
2. **Redeploy**: Trigger a new deployment after config changes
3. **Check Build Logs**: Ensure the build succeeds without errors

---

## Alternative: Using A Records (Not Recommended)

If CNAME doesn't work, you can use A records pointing to Vercel's IP addresses, but this is not recommended because:
- Vercel's IPs can change
- CNAME is the preferred method for subdomains

If you must use A records, contact Vercel support for current IP addresses.

---

## Summary Checklist

- [ ] Removed `basePath` from `apps/admin/next.config.mjs`
- [ ] Removed `basePath` from `apps/vendor-portal/next.config.js`
- [ ] Added CNAME record for `admin` subdomain in Hostinger
- [ ] Added CNAME record for `vendors` subdomain in Hostinger
- [ ] Added `admin.opusfestaevents.com` domain in Vercel Admin project
- [ ] Added `vendors.opusfestaevents.com` domain in Vercel Vendor Portal project
- [ ] Removed rewrites from `apps/website/vercel.json`
- [ ] Verified DNS propagation
- [ ] Tested both subdomains in browser
- [ ] Updated environment variables if needed

---

## After Setup

Your applications will be accessible at:
- **Website**: `https://opusfestaevents.com`
- **Admin**: `https://admin.opusfestaevents.com`
- **Vendor Portal**: `https://vendors.opusfestaevents.com`

All three apps can still share the same Supabase instance and environment variables.
