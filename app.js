/**
 * ReconX Mobile Founder Portal - Core Application Logic
 * 
 * 100% SECURE: Zero hardcoded secrets in client files.
 * Credentials and salts are loaded dynamically via /api/config
 * using Vercel Environment Variables upon passkey authentication.
 */

(() => {
  // Dynamically initialized upon authentication (named supabaseClient to avoid CDN global collision)
  let supabaseClient = null;
  let HMAC_SECRET_SALT = '';

  // State
  let allLicenses = [];
  let lastMintedData = null;

  // DOM Elements
  const authScreen = document.getElementById('authScreen');
  const appScreen = document.getElementById('appScreen');
  const authForm = document.getElementById('authForm');
  const adminKeyInput = document.getElementById('adminKeyInput');
  const authError = document.getElementById('authError');
  const logoutBtn = document.getElementById('logoutBtn');

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const mintForm = document.getElementById('mintForm');
  const resultCard = document.getElementById('resultCard');
  const closeResultBtn = document.getElementById('closeResultBtn');

  // Result Elements
  const resFirm = document.getElementById('resFirm');
  const resEdition = document.getElementById('resEdition');
  const resValidity = document.getElementById('resValidity');
  const resLicenseKey = document.getElementById('resLicenseKey');
  const pairingCodeContainer = document.getElementById('pairingCodeContainer');
  const resPartnerCode = document.getElementById('resPartnerCode');
  const articleCodeBox = document.getElementById('articleCodeBox');
  const resArticleCode = document.getElementById('resArticleCode');
  const shareWhatsappBtn = document.getElementById('shareWhatsappBtn');
  const copyMessageBtn = document.getElementById('copyMessageBtn');

  // Records
  const recordsList = document.getElementById('recordsList');
  const recordCount = document.getElementById('recordCount');
  const searchRecords = document.getElementById('searchRecords');
  const refreshRecordsBtn = document.getElementById('refreshRecordsBtn');

  // ==========================================
  // 1. AUTHENTICATION & SESSION HANDLING
  // ==========================================
  async function checkSession() {
    try {
      const saved = localStorage.getItem('reconx_founder_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.passkey) {
          // Re-validate against /api/config
          const ok = await authenticateWithBackend(parsed.passkey, false);
          if (ok) {
            showApp();
            return;
          }
        }
      }
    } catch (e) {
      console.warn('Session check notice:', e);
    }
    showAuth();
  }

  function showAuth() {
    authScreen.classList.add('active');
    authScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
    appScreen.classList.remove('active');
  }

  function showApp() {
    authScreen.classList.remove('active');
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    appScreen.classList.add('active');
    loadActiveLicenses();
  }

  async function authenticateWithBackend(passkey, showAlertOnError = true) {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkey: passkey.trim() })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (showAlertOnError) {
          authError.textContent = data.error || 'Authentication failed. Please verify your passkey.';
          authError.classList.remove('hidden');
        }
        return false;
      }

      // Initialize Supabase Client safely using window.supabase CDN
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabaseClient = window.supabase.createClient(data.supabaseUrl, data.supabaseAnonKey);
      } else {
        console.warn('Supabase SDK not loaded globally from CDN');
      }
      HMAC_SECRET_SALT = data.hmacSalt;

      // Cache session in localStorage for convenient mobile access
      localStorage.setItem('reconx_founder_session', JSON.stringify({
        passkey: passkey.trim(),
        config: data
      }));

      authError.classList.add('hidden');
      return true;
    } catch (err) {
      if (showAlertOnError) {
        authError.textContent = 'Connection error: ' + (err.message || 'Cannot reach /api/config. Ensure site is deployed on Vercel.');
        authError.classList.remove('hidden');
      }
      return false;
    }
  }

  authForm.addEventListener('submit', async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const val = adminKeyInput.value.trim();
    if (!val) return;

    const btn = authForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Verifying Passkey...';

    const success = await authenticateWithBackend(val, true);
    btn.disabled = false;
    btn.textContent = 'Unlock Console';

    if (success) {
      showApp();
    }
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('reconx_founder_session');
    supabaseClient = null;
    HMAC_SECRET_SALT = '';
    showAuth();
  });

  // ==========================================
  // 2. TABS SWITCHING
  // ==========================================
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active', 'hidden'));
      tabContents.forEach(c => c.classList.add('hidden'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.remove('hidden');
        targetContent.classList.add('active');
      }
    });
  });

  // ==========================================
  // 3. CRYPTOGRAPHIC KEY GENERATOR (BOUND TO MACHINE ID)
  // ==========================================
  function generateAlgorithmicLicenseKey(edition, days = 365, machineId = '') {
    const editionMap = {
      'solo': 'SOLO',
      'partner-50-50': 'P50',
      'owner-article': 'ART',
      'full-firm': 'FIRM'
    };

    const edCode = editionMap[edition] || 'SOLO';
    const dayCode = days >= 3650 ? 'LT' : `${days}D`;
    
    // Extract clean Machine ID hash block
    let midBlock = '';
    let cleanMid = '';
    if (machineId && machineId.trim()) {
      cleanMid = machineId.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      midBlock = cleanMid.slice(-4).padStart(4, 'M');
    } else {
      midBlock = Math.random().toString(36).substring(2, 6).toUpperCase();
    }

    // Deterministic checksum embedding machine ID
    const seed = `${edCode}-${dayCode}-${midBlock}-${cleanMid}-${HMAC_SECRET_SALT}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    const checksum = Math.abs(hash).toString(36).substring(0, 4).toUpperCase().padStart(4, 'X');

    return `RX-${edCode}-${dayCode}-${midBlock}-${checksum}`;
  }

  function generatePairingCode(prefix = 'PT') {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let res = '';
    for (let i = 0; i < 4; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `RX-${prefix}-${res}`;
  }

  // ==========================================
  // 4. MINT LICENSE ACTION
  // ==========================================
  mintForm.addEventListener('submit', async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!supabaseClient) {
      alert('Session expired. Please re-authenticate.');
      showAuth();
      return;
    }

    const submitBtn = document.getElementById('mintSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Minting & Registering on Cloud...';

    const firmName = document.getElementById('firmName').value.trim();
    const ownerName = document.getElementById('ownerName').value.trim();
    const frn = document.getElementById('frnInput').value.trim();
    const ownerPhone = document.getElementById('ownerPhone').value.replace(/[^0-9]/g, '');
    const ownerEmail = document.getElementById('ownerEmail').value.trim() || `${ownerPhone}@practice.in`;
    const rawMachineId = document.getElementById('machineIdInput').value.trim();

    if (!rawMachineId) {
      alert('Client Hardware Machine ID is mandatory! The license key is strictly locked to this specific computer.');
      submitBtn.disabled = false;
      submitBtn.textContent = '⚡ Mint License & Generate Pairing Codes';
      return;
    }
    const machineId = rawMachineId.toUpperCase();

    const edition = document.querySelector('input[name="edition"]:checked').value;
    const validityDays = parseInt(document.getElementById('validityDays').value, 10);
    const paymentMethod = document.getElementById('paymentMethod').value;

    const editionNames = {
      'solo': 'Solo Practitioner (1 PC)',
      'partner-50-50': '50:50 Partner Practice (2 PCs)',
      'owner-article': 'Principal CA + Articleship (6 PCs)',
      'full-firm': 'Full Chartered Firm (15 PCs)'
    };
    const seatMap = { 'solo': 1, 'partner-50-50': 2, 'owner-article': 6, 'full-firm': 15 };
    const priceMap = { 'solo': 3999, 'partner-50-50': 6999, 'owner-article': 9999, 'full-firm': 17999 };

    // 1. Generate License Key strictly bound to this Machine ID
    const licenseKey = generateAlgorithmicLicenseKey(edition, validityDays, machineId);

    // 2. Generate Pairing Codes STRICTLY based on selected installation edition
    let partnerCode = null;
    let articleCode = null;
    if (edition === 'partner-50-50') {
      partnerCode = generatePairingCode('PT');
      articleCode = null;
    } else if (edition === 'owner-article') {
      partnerCode = null;
      articleCode = generatePairingCode('AT');
    } else if (edition === 'full-firm') {
      partnerCode = generatePairingCode('PT');
      articleCode = generatePairingCode('AT');
    } else {
      // Solo: Zero pairing codes!
      partnerCode = null;
      articleCode = null;
    }

    const now = new Date();
    const expiresDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

    // 3. Save into Supabase 'licenses' table with bound machine_id
    try {
      const licensePayload = {
        firm_name: firmName,
        frn: frn || null,
        owner_email: ownerEmail,
        practice_edition: edition,
        license_key: licenseKey,
        machine_id: machineId,
        max_seats: seatMap[edition],
        status: 'active',
        payment_provider: paymentMethod,
        amount_paid_inr: priceMap[edition],
        activated_at: now.toISOString(),
        expires_at: expiresDate.toISOString(),
        updated_at: now.toISOString()
      };

      const { data: licRow, error: licErr } = await supabaseClient
        .from('licenses')
        .upsert(licensePayload, { onConflict: 'license_key' })
        .select('id')
        .single();

      if (licErr) {
        console.warn('[Supabase License Upsert Notice]:', licErr.message);
      }

      // 4. Save/Update host profile in 'user_profiles' with pairing codes and machine_id
      const hostProfilePayload = {
        email: ownerEmail,
        full_name: ownerName,
        phone: ownerPhone,
        role: 'owner',
        firm_name: firmName,
        frn: frn || null,
        machine_id: machineId,
        practice_edition: edition,
        partner_pairing_code: partnerCode,
        article_pairing_code: articleCode,
        email_verified: true,
        last_login_at: now.toISOString(),
        updated_at: now.toISOString()
      };

      await supabaseClient
        .from('user_profiles')
        .upsert(hostProfilePayload, { onConflict: 'email,machine_id' });

      // 5. Pre-bind machine into license_seats
      if (licRow?.id && machineId) {
        await supabaseClient
          .from('license_seats')
          .upsert({
            license_id: licRow.id,
            machine_id: machineId,
            station_name: `${ownerName} (Host)`,
            role: 'owner',
            is_host_station: true,
            authorized_by_host: true,
            last_active_at: now.toISOString()
          }, { onConflict: 'license_id,machine_id' });
      }

      // Store last minted state
      lastMintedData = {
        firmName,
        ownerName,
        ownerPhone,
        machineId,
        edition: editionNames[edition],
        validityDays,
        licenseKey,
        partnerCode,
        articleCode
      };

      // Show Result
      resFirm.textContent = firmName;
      resEdition.textContent = editionNames[edition];
      resValidity.textContent = `${validityDays} Days (Active)`;
      resLicenseKey.textContent = licenseKey;

      if (partnerCode || articleCode) {
        pairingCodeContainer.classList.remove('hidden');
        if (partnerCode) {
          resPartnerCode.textContent = partnerCode;
        }
        if (articleCode) {
          articleCodeBox.classList.remove('hidden');
          resArticleCode.textContent = articleCode;
        } else {
          articleCodeBox.classList.add('hidden');
        }
      } else {
        pairingCodeContainer.classList.add('hidden');
      }

      resultCard.classList.remove('hidden');
      resultCard.scrollIntoView({ behavior: 'smooth' });

      // Reload active records list
      loadActiveLicenses();

    } catch (err) {
      alert('Notice: Cloud sync exception: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '⚡ Mint License & Generate Pairing Codes';
    }
  });

  closeResultBtn.addEventListener('click', () => {
    resultCard.classList.add('hidden');
  });

  // ==========================================
  // 5. WHATSAPP & CLIPBOARD SHARING
  // ==========================================
  function buildWhatsAppMessage(data) {
    let msg = `🏛️ *ReconX Office Management OS — Official License*\n`;
    msg += `-----------------------------------------\n`;
    msg += `*Firm:* ${data.firmName}\n`;
    msg += `*Managing CA:* ${data.ownerName}\n`;
    msg += `*Plan Edition:* ${data.edition}\n`;
    msg += `*Locked Computer (Machine ID):* \`${data.machineId}\`\n`;
    msg += `*Validity:* ${data.validityDays} Days (Active)\n\n`;
    msg += `🔑 *MASTER LICENSE KEY (Host PC):*\n`;
    msg += `\`${data.licenseKey}\`\n`;
    msg += `_(Note: This key will ONLY work on computer ${data.machineId})_\n\n`;

    if (data.partnerCode) {
      msg += `👥 *PARTNER PAIRING CODE (PC 2):*\n`;
      msg += `\`${data.partnerCode}\`\n`;
      msg += `📡 *Network Rule:* PC 1 and PC 2 must be connected to the SAME office Local Area Network (Wi-Fi/LAN router) to pair.\n\n`;
    }

    if (data.articleCode) {
      msg += `🎓 *ARTICLE TRAINEE CODE (Articles):*\n`;
      msg += `\`${data.articleCode}\`\n`;
      msg += `📡 *Network Rule:* Article laptops must be connected to the SAME office Local Area Network (Wi-Fi/LAN router) to link.\n\n`;
    }

    if (!data.partnerCode && !data.articleCode) {
      msg += `🔒 *100% Offline Vault:* Solo edition runs completely on this single PC hard drive with zero cloud dependence.\n\n`;
    }

    msg += `📋 *Quick Instructions:*\n`;
    msg += `1. On your PC (${data.machineId}), paste the *License Key* in ReconX to unlock.\n`;
    if (data.partnerCode) {
      msg += `2. On Partner PC (connected to the same office Wi-Fi), select *"Join Existing Firm"* & enter the Partner Pairing Code.\n`;
    }
    msg += `-----------------------------------------\n`;
    msg += `Support: Ayush / ReconX Office Support`;

    return msg;
  }

  shareWhatsappBtn.addEventListener('click', () => {
    if (!lastMintedData) return;
    const msg = buildWhatsAppMessage(lastMintedData);
    const cleanPhone = lastMintedData.ownerPhone.replace(/[^0-9]/g, '');
    const phoneParam = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const waUrl = `https://wa.me/${phoneParam}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  });

  copyMessageBtn.addEventListener('click', () => {
    if (!lastMintedData) return;
    const msg = buildWhatsAppMessage(lastMintedData);
    navigator.clipboard.writeText(msg).then(() => {
      alert('✓ Activation details copied to clipboard! You can paste directly on WhatsApp.');
    });
  });

  // ==========================================
  // 6. ACTIVE LICENSES DIRECTORY
  // ==========================================
  async function loadActiveLicenses() {
    if (!supabaseClient) return;
    recordsList.innerHTML = '<div class="loading-state">Loading active licenses...</div>';
    try {
      const { data, error } = await supabaseClient
        .from('licenses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error || !data) {
        recordsList.innerHTML = '<div class="loading-state">No licenses found or offline.</div>';
        return;
      }

      allLicenses = data;
      recordCount.textContent = data.length;
      renderRecords(data);
    } catch (err) {
      recordsList.innerHTML = '<div class="loading-state">Failed to fetch cloud records.</div>';
    }
  }

  function renderRecords(items) {
    if (items.length === 0) {
      recordsList.innerHTML = '<div class="loading-state">No matching licenses.</div>';
      return;
    }

    const html = items.map(lic => {
      const expiresAt = new Date(lic.expires_at);
      const diffDays = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const isExpired = diffDays <= 0;

      return `
        <div class="record-item">
          <div class="record-top">
            <strong class="record-firm">${lic.firm_name}</strong>
            <span class="record-badge" style="background: ${isExpired ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}; color: ${isExpired ? '#EF4444' : '#34D399'}">
              ${isExpired ? 'Expired' : `${diffDays}d Left`}
            </span>
          </div>
          <div class="record-meta">
            <div>Edition: <strong>${lic.practice_edition}</strong> (${lic.max_seats} Seats)</div>
            <div>Owner: ${lic.owner_email} • Paid: ₹${lic.amount_paid_inr || 0}</div>
          </div>
          <div class="record-key">${lic.license_key}</div>
        </div>
      `;
    }).join('');

    recordsList.innerHTML = html;
  }

  searchRecords.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      renderRecords(allLicenses);
      return;
    }
    const filtered = allLicenses.filter(l => 
      (l.firm_name && l.firm_name.toLowerCase().includes(q)) ||
      (l.owner_email && l.owner_email.toLowerCase().includes(q)) ||
      (l.license_key && l.license_key.toLowerCase().includes(q)) ||
      (l.practice_edition && l.practice_edition.toLowerCase().includes(q))
    );
    renderRecords(filtered);
  });

  refreshRecordsBtn.addEventListener('click', loadActiveLicenses);

  // Initialize on load
  checkSession();
})();
