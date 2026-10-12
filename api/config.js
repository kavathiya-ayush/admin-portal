/**
 * Vercel Serverless Function: Secure Configuration & Authentication Gateway
 * 
 * Protects all sensitive credentials (Supabase URL, Anon Key, HMAC Salt, Master Passkey).
 * Only returns configuration if the caller provides the correct Master Passkey configured
 * in Vercel Environment Variables.
 */

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }

    const { passkey } = body || {};

    // 1. Read Master Passkey from Vercel Environment Variables
    const masterKey = process.env.MASTER_ADMIN_PASSKEY;

    if (!masterKey) {
      return res.status(500).json({
        success: false,
        error: 'Vercel configuration missing: Please set MASTER_ADMIN_PASSKEY in your Vercel Project Settings > Environment Variables.'
      });
    }

    // 2. Validate Passkey
    if (!passkey || passkey.trim() !== masterKey.trim()) {
      return res.status(401).json({
        success: false,
        error: 'Invalid Master Passkey. Access Denied.'
      });
    }

    // 3. Read Supabase credentials from Vercel Environment Variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const hmacSalt = process.env.HMAC_SECRET_SALT;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({
        success: false,
        error: 'Vercel configuration missing: Please set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel Environment Variables.'
      });
    }

    // 4. Return secure configuration to authenticated Founder session
    return res.status(200).json({
      success: true,
      supabaseUrl,
      supabaseAnonKey,
      hmacSalt: hmacSalt || 'RECONX_OS_SECRET_LIC_SALT_2026_AYUSH'
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Internal server error: ' + (err.message || String(err))
    });
  }
}
