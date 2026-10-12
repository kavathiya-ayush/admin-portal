# ReconX Practice OS — Mobile Founder Admin Portal

Mobile web portal for Ayush to issue offline practice licenses, generate multi-machine pairing codes, and share instant activation details with Chartered Accountant clients via WhatsApp upon receiving direct UPI/phone payments.

---

## 🔒 Security & Privacy (Safe for Public GitHub Repos)
**Zero sensitive credentials or passwords are committed to this repository.**
All critical secrets (Master Passkey, Supabase URL, Anon Key, and HMAC cryptographic salt) are securely managed through **Vercel Environment Variables**.

---

## 🚀 Setup & Deployment to Vercel

### Step 1: Deploy to Vercel
1. Import this repository into [Vercel](https://vercel.com/new).
2. Framework Preset: **Other** (Root directory: `./`).
3. Click **Deploy**.

### Step 2: Configure Environment Variables in Vercel
In your Vercel Project Dashboard, navigate to **Settings > Environment Variables** and add the following 4 variables:

| Variable Name | Value | Description |
| :--- | :--- | :--- |
| `MASTER_ADMIN_PASSKEY` | `RECONX-AYUSH-2026` | Master passkey used to unlock the console on your phone |
| `SUPABASE_URL` | `https://ddezbsdplmcqdewolpxg.supabase.co` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | *(Your Supabase Anon Key)* | Your Supabase public API key |
| `HMAC_SECRET_SALT` | `RECONX_OS_SECRET_LIC_SALT_2026_AYUSH` | Cryptographic salt matching ReconX desktop OS |

*After adding the variables, trigger a Redeploy on Vercel.*

---

## 📱 How to Use on Your Smartphone
1. Open your live Vercel URL (e.g. `https://admin-portal-xxx.vercel.app`) in Safari or Chrome on your phone.
2. Add to Home Screen:
   - **iPhone**: Tap Share icon $\rightarrow$ **Add to Home Screen**.
   - **Android**: Tap 3 dots $\rightarrow$ **Add to Home screen**.
3. Enter your Master Passkey (`RECONX-AYUSH-2026`). Your session will stay saved on your phone.
4. When a CA pays you directly on PhonePe/GPay:
   - Fill in their Firm Name, CA Mobile, and Machine ID.
   - Choose their plan: **Solo (₹3,999)**, **50:50 Partner (₹6,999)**, **Articleship (₹9,999)**, or **Full Firm (₹17,999)**.
   - Tap **⚡ Mint License & Generate Pairing Codes**.
   - Tap **💬 Share on WhatsApp** to instantly send them their License Key & Pairing Codes!
