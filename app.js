/**
 * ReconX Mobile Founder Portal - Core Application Logic
 * 
 * 100% SECURE: Zero hardcoded secrets in client files.
 * Credentials and salts are loaded dynamically via /api/config
 * using Vercel Environment Variables upon passkey authentication.
 */

(() => {
  // Dynamically initialized upon authentication
  let supabaseClient = null;
  let HMAC_SECRET_SALT = '';

  // State
  let allLicenses = [];
  let lastMintedData = null;
  let detectedUserProfile = null;

  // DOM Elements - Authentication
  const authScreen = document.getElementById('authScreen');
  const appScreen = document.getElementById('appScreen');
  const authForm = document.getElementById('authForm');
  const adminKeyInput = document.getElementById('adminKeyInput');
  const authError = document.getElementById('authError');
  const logoutBtn = document.getElementById('logoutBtn');

  // Navigation
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const mintForm = document.getElementById('mintForm');
  const resultCard = document.getElementById('resultCard');
  const closeResultBtn = document.getElementById('closeResultBtn');

  // Single Machine Input & Auto-Detected Profile Elements
  const machineIdInput = document.getElementById('machineIdInput');
  const lookupMachineBtn = document.getElementById('lookupMachineBtn');
  const detectedProfileCard = document.getElementById('detectedProfileCard');
  const unregisteredMachineCard = document.getElementById('unregisteredMachineCard');
  const detFirmName = document.getElementById('detFirmName');
  const detCaName = document.getElementById('detCaName');
  const detPhone = document.getElementById('detPhone');
  const detFrn = document.getElementById('detFrn');
  const detEdition = document.getElementById('detEdition');
  const detSeats = document.getElementById('detSeats');
  const detPrice = document.getElementById('detPrice');
  const detEditionBadge = document.getElementById('detEditionBadge');
  const fallbackEdition = document.getElementById('fallbackEdition');

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

      if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabaseClient = window.supabase.createClient(data.supabaseUrl, data.supabaseAnonKey);
      }
      HMAC_SECRET_SALT = data.hmacSalt;

      localStorage.setItem('reconx_founder_session', JSON.stringify({
        passkey: passkey.trim(),
        config: data
      }));

      authError.classList.add('hidden');
      return true;
    } catch (err) {
      if (showAlertOnError) {
        authError.textContent = 'Connection error: ' + (err.message || 'Cannot reach /api/config.');
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
  // 3. AUTO-LOOKUP USER PROFILE FROM MACHINE ID
  // ==========================================
  const EDITION_META = {
    'solo': {
      name: 'Solo Practitioner (1 PC)',
      seats: '1 Bound Workstation • 100% Offline Vault',
      price: '₹3,999 / year',
      pill: 'Solo Practice'
    },
    'partner-50-50': {
      name: '50:50 Partner Practice (2 PCs)',
      seats: '2 Bound Workstations • Generates Partner Pairing Code',
      price: '₹6,999 / year',
      pill: '50:50 Partner'
    },
    'owner-article': {
      name: 'Principal CA + Articles (6 PCs)',
      seats: '6 Bound Seats (1 Principal CA + 5 Articles)',
      price: '₹9,999 / year',
      pill: 'CA + Articles'
    },
    'full-firm': {
      name: 'Full Chartered Firm (15 PCs)',
      seats: '15 Bound Seats • Multi-Partner Dual Codes',
      price: '₹17,999 / year',
      pill: 'Full Firm'
    }
  };

  async function lookupMachineProfile(mid) {
    if (!supabaseClient || !mid) return;
    const cleanMid = mid.trim().toUpperCase();
    if (cleanMid.length < 4) return;

    if (lookupMachineBtn) {
      lookupMachineBtn.textContent = '⏳ Looking up...';
      lookupMachineBtn.disabled = true;
    }

    try {
      const { data, error } = await supabaseClient
        .from('user_profiles')
        .select('*')
        .or(`machine_id.eq.${cleanMid},machine_id.ilike.%${cleanMid.replace('RX-WIN-', '')}%`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        detectedUserProfile = data[0];
        if (detFirmName) detFirmName.textContent = detectedUserProfile.firm_name || 'Chartered Practice Firm';
        if (detCaName) detCaName.textContent = detectedUserProfile.full_name || 'Managing CA';
        if (detPhone) detPhone.textContent = detectedUserProfile.phone || 'Not Registered';
        if (detFrn) detFrn.textContent = detectedUserProfile.frn || 'None';
        
        const ed = detectedUserProfile.practice_edition || 'solo';
        const meta = EDITION_META[ed] || EDITION_META['solo'];

        if (detEdition) detEdition.textContent = meta.name;
        if (detSeats) detSeats.textContent = meta.seats;
        if (detPrice) detPrice.textContent = meta.price;
        if (detEditionBadge) detEditionBadge.textContent = meta.pill;

        if (detectedProfileCard) detectedProfileCard.classList.remove('hidden');
        if (unregisteredMachineCard) unregisteredMachineCard.classList.add('hidden');
      } else {
        detectedUserProfile = null;
        if (detectedProfileCard) detectedProfileCard.classList.add('hidden');
        if (unregisteredMachineCard) unregisteredMachineCard.classList.remove('hidden');
      }
    } catch (e) {
      console.warn('Machine profile lookup note:', e);
    } finally {
      if (lookupMachineBtn) {
        lookupMachineBtn.textContent = '🔍 Find Profile';
        lookupMachineBtn.disabled = false;
      }
    }
  }

  let lookupTimer = null;
  if (machineIdInput) {
    machineIdInput.addEventListener('input', () => {
      clearTimeout(lookupTimer);
      const val = machineIdInput.value.trim();
      if (val.length >= 6) {
        lookupTimer = setTimeout(() => lookupMachineProfile(val), 350);
      }
    });
    machineIdInput.addEventListener('change', () => lookupMachineProfile(machineIdInput.value));
    machineIdInput.addEventListener('blur', () => lookupMachineProfile(machineIdInput.value));
  }
  if (lookupMachineBtn) {
    lookupMachineBtn.addEventListener('click', () => lookupMachineProfile(machineIdInput.value));
  }

  // ==========================================
  // 4. CRYPTOGRAPHIC KEY GENERATOR (BOUND TO MACHINE ID)
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
  // 5. MINT LICENSE ACTION (ONLY MACHINE ID REQUIRED)
  // ==========================================
  mintForm.addEventListener('submit', async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!supabaseClient) {
      alert('Session expired. Please re-authenticate.');
      showAuth();
      return;
    }

    const rawMachineId = machineIdInput.value.trim();
    if (!rawMachineId) {
      alert('Please enter the Client Computer Machine ID.');
      return;
    }
    const machineId = rawMachineId.toUpperCase();

    const submitBtn = document.getElementById('mintSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Minting & Registering on Cloud...';

    // If profile was not looked up yet, trigger quick lookup
    if (!detectedUserProfile) {
      await lookupMachineProfile(machineId);
    }

    const firmName = detectedUserProfile?.firm_name || `Chartered Practice (${machineId.slice(-6)})`;
    const ownerName = detectedUserProfile?.full_name || 'Managing CA';
    const ownerPhone = detectedUserProfile?.phone || '';
    const ownerEmail = detectedUserProfile?.email || `${machineId.toLowerCase()}@practice.internal`;
    const frn = detectedUserProfile?.frn || null;

    // Auto-detect edition from client setup profile in Supabase, or fallback if unregistered
    const edition = detectedUserProfile?.practice_edition 
      || (fallbackEdition ? fallbackEdition.value : 'solo');

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
      partnerCode = null;
      articleCode = null;
    }

    const now = new Date();
    const expiresDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

    // 3. Save into Supabase 'licenses' table with bound machine_id
    try {
      const licensePayload = {
        firm_name: firmName,
        frn: frn,
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

      // 4. Update host profile in 'user_profiles' with pairing codes if present
      if (detectedUserProfile) {
        await supabaseClient
          .from('user_profiles')
          .update({
            practice_edition: edition,
            partner_pairing_code: partnerCode,
            article_pairing_code: articleCode,
            updated_at: now.toISOString()
          })
          .eq('machine_id', machineId);
      }

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
  // 6. WHATSAPP & CLIPBOARD SHARING
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
      msg += `📡 *Network Rule:* Both PC 1 and PC 2 must be connected to the SAME office Local Area Network (Wi-Fi/LAN router) to pair.\n\n`;
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
    const cleanPhone = (lastMintedData.ownerPhone || '').replace(/[^0-9]/g, '');
    const phoneParam = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const waUrl = phoneParam ? `https://wa.me/${phoneParam}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
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
  // 7. ACTIVE LICENSES DIRECTORY & REVOCATION
  // ==========================================
  let currentFilter = 'active'; // 'active' | 'revoked' | 'all'
  let profileMap = new Map();
  const adminToast = document.getElementById('adminToast');
  const filterPills = document.querySelectorAll('.filter-pill');

  function showToast(message, isError = false) {
    if (!adminToast) {
      alert(message);
      return;
    }
    adminToast.textContent = message;
    adminToast.style.borderColor = isError ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)';
    adminToast.style.color = isError ? '#F87171' : '#34D399';
    adminToast.classList.remove('hidden');
    setTimeout(() => {
      adminToast.classList.add('hidden');
    }, 3500);
  }

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.getAttribute('data-filter') || 'active';
      applyFilterAndRender();
    });
  });

  async function loadActiveLicenses() {
    if (!supabaseClient) return;
    recordsList.innerHTML = '<div class="loading-state">Loading verified licenses from Supabase...</div>';
    try {
      const [licRes, profRes] = await Promise.all([
        supabaseClient
          .from('licenses')
          .select('*')
          .neq('status', 'deleted')
          .order('created_at', { ascending: false }),
        supabaseClient
          .from('user_profiles')
          .select('email, phone, full_name, machine_id')
          .then(res => res.data || [])
          .catch(() => [])
      ]);

      if (licRes.error || !licRes.data) {
        recordsList.innerHTML = '<div class="loading-state">No licenses found or offline.</div>';
        return;
      }

      profileMap.clear();
      if (Array.isArray(profRes)) {
        profRes.forEach(p => {
          if (p.email) profileMap.set(p.email.toLowerCase(), p);
          if (p.machine_id) profileMap.set(p.machine_id.toUpperCase(), p);
        });
      }

      allLicenses = licRes.data;
      updateRecordCounter();
      applyFilterAndRender();
    } catch (err) {
      recordsList.innerHTML = `<div class="loading-state">Failed to fetch cloud records: ${err.message}</div>`;
    }
  }

  function updateRecordCounter() {
    const activeCount = allLicenses.filter(l => l.status !== 'revoked' && l.machine_id && l.machine_id.trim().length > 0).length;
    if (recordCount) {
      recordCount.textContent = activeCount;
    }
  }

  function applyFilterAndRender() {
    const q = (searchRecords?.value || '').toLowerCase().trim();

    let filtered = allLicenses.filter(lic => {
      const isRevoked = lic.status === 'revoked';
      const hasBoundPc = !!(lic.machine_id && lic.machine_id.trim().length > 0);

      if (currentFilter === 'active') {
        return !isRevoked && hasBoundPc;
      } else if (currentFilter === 'revoked') {
        return isRevoked;
      } else {
        // 'all' filter: show all non-deleted licenses
        return true;
      }
    });

    if (q) {
      filtered = filtered.filter(l => 
        (l.firm_name && l.firm_name.toLowerCase().includes(q)) ||
        (l.owner_email && l.owner_email.toLowerCase().includes(q)) ||
        (l.machine_id && l.machine_id.toLowerCase().includes(q)) ||
        (l.license_key && l.license_key.toLowerCase().includes(q)) ||
        (l.practice_edition && l.practice_edition.toLowerCase().includes(q))
      );
    }

    renderRecords(filtered);
  }

  function renderRecords(items) {
    if (items.length === 0) {
      recordsList.innerHTML = `
        <div class="loading-state">
          ${currentFilter === 'revoked' ? 'No revoked licenses.' : 'No matching licensed users found.'}
        </div>
      `;
      return;
    }

    const html = items.map(lic => {
      const isRevoked = lic.status === 'revoked';
      const expiresAt = new Date(lic.expires_at);
      const diffDays = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const isExpired = diffDays <= 0;

      const userProf = profileMap.get((lic.owner_email || '').toLowerCase()) || 
                       profileMap.get((lic.machine_id || '').toUpperCase()) || {};
      const userPhone = userProf.phone || '';

      const editionLabel = {
        'solo': 'Solo Practitioner',
        'partner-50-50': '50:50 Partner Practice',
        'owner-article': 'Owner CA + Articles',
        'full-firm': 'Enterprise Multi-Desk Firm'
      }[lic.practice_edition] || (lic.practice_edition || 'Solo').toUpperCase();

      const paymentLabel = {
        'direct_upi_gpay': 'Direct UPI (GPay / PhonePe)',
        'razorpay': 'Razorpay Online Gateway',
        'vip_code': 'VIP Founder Code',
        'offline_admin': 'Admin Issued'
      }[lic.payment_provider] || (lic.payment_provider || 'Direct UPI');

      let badgeHtml = '';
      if (isRevoked) {
        badgeHtml = '<span class="record-badge-status badge-revoked">🚫 REVOKED</span>';
      } else if (isExpired) {
        badgeHtml = `<span class="record-badge-status badge-expired">⏳ EXPIRED (${Math.abs(diffDays)}d ago)</span>`;
      } else {
        badgeHtml = `<span class="record-badge-status badge-active">✓ ACTIVE • ${diffDays}d Left</span>`;
      }

      return `
        <div class="record-item ${isRevoked ? 'is-revoked' : ''}" data-id="${lic.id}">
          <div class="record-top">
            <div class="record-firm-title">
              <strong class="record-firm">${lic.firm_name || 'Chartered Practice'}</strong>
            </div>
            ${badgeHtml}
          </div>

          <div class="record-details-grid">
            <div class="record-detail-item">
              <span class="detail-label">💻 Bound PC ID</span>
              <span class="detail-value">
                <span class="pc-chip">${lic.machine_id || 'Unbound / Legacy'}</span>
              </span>
            </div>

            <div class="record-detail-item">
              <span class="detail-label">📧 Owner Email</span>
              <span class="detail-value">${lic.owner_email || 'ayush@gmail.com'}</span>
            </div>

            <div class="record-detail-item">
              <span class="detail-label">📱 WhatsApp Mobile</span>
              <span class="detail-value">${userPhone ? `+91 ${userPhone}` : 'Direct Practice'}</span>
            </div>

            <div class="record-detail-item">
              <span class="detail-label">🏷️ Practice Edition</span>
              <span class="detail-value">${editionLabel} (${lic.max_seats || 1} Seats)</span>
            </div>

            <div class="record-detail-item">
              <span class="detail-label">💳 Payment Method</span>
              <span class="detail-value">${paymentLabel} • ₹${lic.amount_paid_inr || 3999}</span>
            </div>

            <div class="record-detail-item">
              <span class="detail-label">📅 Activated Date</span>
              <span class="detail-value">${new Date(lic.activated_at || lic.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>

            <div class="record-detail-item">
              <span class="detail-label">⌛ Expiry Deadline</span>
              <span class="detail-value">${new Date(lic.expires_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>

            <div class="record-detail-item">
              <span class="detail-label">🛡️ Status</span>
              <span class="detail-value" style="color: ${isRevoked ? '#F87171' : (isExpired ? '#FBBF24' : '#34D399')}">
                ${isRevoked ? 'Revoked by Admin' : (isExpired ? 'Expired' : 'Verified & Active')}
              </span>
            </div>
          </div>

          <div class="record-key-container">
            <span class="record-key-text">${lic.license_key}</span>
            <button class="btn-action-sm btn-copy-rec" data-action="copy-key" data-key="${lic.license_key}" title="Copy License Key">
              📋 Copy Key
            </button>
          </div>

          <div class="record-actions-row">
            ${isRevoked 
              ? `<button class="btn-action-sm btn-reactivate" data-action="reactivate" data-id="${lic.id}">
                   ✅ Reactivate License
                 </button>`
              : `<button class="btn-action-sm btn-revoke" data-action="revoke" data-id="${lic.id}">
                   🚫 Revoke License
                 </button>`
            }

            ${userPhone ? `
              <button class="btn-action-sm btn-copy-rec" data-action="whatsapp" data-id="${lic.id}">
                💬 WhatsApp
              </button>
            ` : ''}

            <button class="btn-action-sm btn-delete-rec" data-action="delete" data-id="${lic.id}" title="Remove record">
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
    }).join('');

    recordsList.innerHTML = html;
  }

  // Delegated event handling for records actions (Revoke, Reactivate, Copy, Delete)
  recordsList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    const lic = allLicenses.find(l => l.id === id);

    if (action === 'copy-key') {
      const key = btn.getAttribute('data-key');
      if (key) {
        navigator.clipboard.writeText(key).then(() => {
          showToast('✓ License key copied to clipboard!');
        });
      }
      return;
    }

    if (!lic || !supabaseClient) return;

    if (action === 'revoke') {
      const confirmMsg = `⚠️ IMMEDIATE REVOCATION:\nAre you sure you want to REVOKE the license for:\n• Firm: ${lic.firm_name}\n• PC: ${lic.machine_id || 'All'}\n• Key: ${lic.license_key}\n\nThe desktop software on this PC will be locked out immediately!`;
      if (!confirm(confirmMsg)) return;

      btn.disabled = true;
      btn.textContent = 'Revoking...';

      try {
        const { error } = await supabaseClient
          .from('licenses')
          .update({
            status: 'revoked',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (error) {
          alert('Failed to revoke license: ' + error.message);
          btn.disabled = false;
          btn.textContent = '🚫 Revoke License';
        } else {
          lic.status = 'revoked';
          updateRecordCounter();
          showToast(`🚫 License for "${lic.firm_name}" (PC: ${lic.machine_id}) REVOKED instantly!`, true);
          applyFilterAndRender();
        }
      } catch (err) {
        alert('Revocation error: ' + err.message);
        btn.disabled = false;
      }
      return;
    }

    if (action === 'reactivate') {
      if (!confirm(`Reactivate license for "${lic.firm_name}" (PC: ${lic.machine_id})?`)) return;

      btn.disabled = true;
      btn.textContent = 'Reactivating...';

      try {
        const { error } = await supabaseClient
          .from('licenses')
          .update({
            status: 'active',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (error) {
          alert('Failed to reactivate: ' + error.message);
          btn.disabled = false;
          btn.textContent = '✅ Reactivate License';
        } else {
          lic.status = 'active';
          updateRecordCounter();
          showToast(`✓ License for "${lic.firm_name}" re-activated successfully!`);
          applyFilterAndRender();
        }
      } catch (err) {
        alert('Reactivation error: ' + err.message);
        btn.disabled = false;
      }
      return;
    }

    if (action === 'delete') {
      if (!confirm(`Permanently remove license record for "${lic.firm_name}" (${lic.license_key})?`)) return;

      btn.disabled = true;
      try {
        const { error } = await supabaseClient
          .from('licenses')
          .update({
            status: 'deleted',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (error) {
          alert('Delete error: ' + error.message);
          btn.disabled = false;
        } else {
          allLicenses = allLicenses.filter(l => l.id !== id);
          updateRecordCounter();
          showToast('Record removed.');
          applyFilterAndRender();
        }
      } catch (err) {
        alert('Delete error: ' + err.message);
      }
      return;
    }

    if (action === 'whatsapp') {
      const userProf = profileMap.get((lic.owner_email || '').toLowerCase()) || 
                       profileMap.get((lic.machine_id || '').toUpperCase()) || {};
      const cleanPhone = (userProf.phone || '').replace(/[^0-9]/g, '');
      const phoneParam = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      const msg = `*ReconX CA Practice OS License*\n\nFirm: ${lic.firm_name}\nPC: ${lic.machine_id}\nLicense Key: ${lic.license_key}\nStatus: ${lic.status === 'revoked' ? 'REVOKED' : 'Active'}`;
      const waUrl = phoneParam ? `https://wa.me/${phoneParam}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, '_blank');
    }
  });

  searchRecords.addEventListener('input', applyFilterAndRender);
  refreshRecordsBtn.addEventListener('click', loadActiveLicenses);

  // Initialize on load
  checkSession();
})();
