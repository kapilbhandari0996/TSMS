// TSMS - Tourist Login & Real KYC Registration Controller
document.addEventListener("DOMContentLoaded", () => {

  const STORAGE_KEYS = {
    LANGUAGE: "tsms_lang",
    THEME: "tsms_theme",
    ACTIVE_TOURIST_ID: "tsms_active_id"
  };

  const TOTAL_KYC_STEPS = 7;

  const state = {
    currentTab: "tourist-login",
    currentLanguage: "en",
    currentTheme: "dark",
    kycStep: 1,
    // Camera
    cameraStream: null,
    selfieDataUrl: null,
    selfieCaptured: false,
    faceAuthPassed: false,
    // OCR / Upload state
    ocrData: null,
    ocrValidationErrors: [],
    ocrValidationPassed: false,
    ocrHasCriticalError: false,
    ocrDocumentUnreadable: false,
    tempFiles: null,
    passportFileSelected: false,
    visaFileSelected: false,
    // Submission
    isSubmitting: false,
    isUploadingOcr: false
  };

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    loadSettings();
    setupTabNavigation();
    setupEventListeners();
    setupFileUploadBoxes();
    setupKycWizard();
    checkQueryParamRole();
  }

  function loadSettings() {
    state.currentLanguage = localStorage.getItem(STORAGE_KEYS.LANGUAGE) || "en";
    state.currentTheme = localStorage.getItem(STORAGE_KEYS.THEME) || "dark";
    document.getElementById("language-select").value = state.currentLanguage;
    translateApp(state.currentLanguage);
    if (state.currentTheme === "light") {
      document.body.classList.add("light-theme");
      document.getElementById("theme-toggle-icon").innerText = "🌙";
    }
  }

  function checkQueryParamRole() {
    const params = new URLSearchParams(window.location.search);
    const role = params.get("role");
    if (role === "admin") {
      window.location.href = "/admin-login";
    } else if (role === "register") {
      switchTab("tourist-reg");
    } else {
      switchTab("tourist-login");
    }
  }

  // ============================================================
  // TRANSLATION
  // ============================================================
  function translateApp(lang) {
    state.currentLanguage = lang;
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
    const dict = window.TSMS_MOCK_DATA.translations[lang] || window.TSMS_MOCK_DATA.translations.en;
    document.title = dict.title ? `${dict.title} | Portal` : "TSMS | Secure Portal Access";
    document.querySelectorAll("[data-translate]").forEach(elem => {
      const key = elem.getAttribute("data-translate");
      if (dict[key]) {
        if (elem.tagName === "INPUT" || elem.tagName === "TEXTAREA") elem.placeholder = dict[key];
        else elem.innerHTML = dict[key];
      }
    });
  }

  // ============================================================
  // TAB NAVIGATION
  // ============================================================
  function setupTabNavigation() {
    const tabs = { "tab-tourist-login": "tourist-login", "tab-tourist-reg": "tourist-reg" };
    Object.keys(tabs).forEach(tabId => {
      document.getElementById(tabId).addEventListener("click", () => switchTab(tabs[tabId]));
    });
  }

  function switchTab(tabName) {
    state.currentTab = tabName;
    const tabButtons = { "tourist-login": "tab-tourist-login", "tourist-reg": "tab-tourist-reg" };
    Object.keys(tabButtons).forEach(name => {
      const btn = document.getElementById(tabButtons[name]);
      if (name === tabName) {
        btn.classList.add("active");
        btn.style.color = "var(--text-primary)";
        btn.style.borderBottom = "2px solid var(--accent)";
      } else {
        btn.classList.remove("active");
        btn.style.color = "var(--text-secondary)";
        btn.style.borderBottom = "2px solid transparent";
      }
    });
    document.getElementById("tourist-login-form-wrapper").style.display = tabName === "tourist-login" ? "block" : "none";
    document.getElementById("tourist-reg-wrapper").style.display = tabName === "tourist-reg" ? "block" : "none";
  }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  function setupEventListeners() {
    document.getElementById("language-select").addEventListener("change", e => translateApp(e.target.value));
    document.getElementById("theme-toggle-btn").addEventListener("click", () => {
      if (document.body.classList.contains("light-theme")) {
        document.body.classList.remove("light-theme");
        document.getElementById("theme-toggle-icon").innerText = "☀️";
        state.currentTheme = "dark";
      } else {
        document.body.classList.add("light-theme");
        document.getElementById("theme-toggle-icon").innerText = "🌙";
        state.currentTheme = "light";
      }
      localStorage.setItem(STORAGE_KEYS.THEME, state.currentTheme);
    });

    // Tourist Login Form
    document.getElementById("tourist-login-form").addEventListener("submit", async e => {
      e.preventDefault();
      const touristId = document.getElementById("t-login-id").value.trim();
      const password = document.getElementById("t-login-pass").value;
      const errorDiv = document.getElementById("tourist-login-error");
      errorDiv.style.display = "none";

      try {
        const res = await fetch("/api/auth/tourist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ touristId, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Login failed.");

        const tourist = data.tourist;

        // Handle KYC status guards
        if (tourist.kycStatus === "Pending") {
          document.getElementById("tourist-login-form").style.display = "none";
          const guard = document.getElementById("kyc-guard-pending");
          guard.style.display = "block";
          document.getElementById("kyc-guard-tourist-id").textContent = tourist.id;
          return;
        }

        if (tourist.kycStatus === "Rejected") {
          document.getElementById("tourist-login-form").style.display = "none";
          const guard = document.getElementById("kyc-guard-rejected");
          guard.style.display = "block";
          document.getElementById("kyc-rejection-reason-display").textContent =
            "Reason: " + (tourist.kycRejectionReason || "No reason provided.");
          return;
        }

        if (tourist.kycStatus === "Manual Review") {
          document.getElementById("tourist-login-form").style.display = "none";
          const guard = document.getElementById("kyc-guard-pending");
          guard.style.display = "block";
          document.getElementById("kyc-guard-pending").querySelector(".kyc-guard-title").textContent = "Under Manual Review";
          document.getElementById("kyc-guard-tourist-id").textContent = tourist.id;
          return;
        }

        // Verified — allow in
        localStorage.setItem(STORAGE_KEYS.ACTIVE_TOURIST_ID, tourist.id);
        if (data.token) {
          localStorage.setItem(STORAGE_KEYS.TSMS_TOKEN, data.token);
        }
        showToast("Safe", `Logged in as ${tourist.fullName}!`);
        setTimeout(() => { window.location.href = "/tourist"; }, 800);
      } catch (err) {
        errorDiv.innerText = `⚠️ ${err.message}`;
        errorDiv.style.display = "block";
        showToast("Danger", err.message);
      }
    });
  }

  // ============================================================
  // FILE UPLOAD BOXES
  // ============================================================
  function setupFileUploadBoxes() {
    const passportInput = document.getElementById("kyc-passport-file");
    const visaInput = document.getElementById("kyc-visa-file");

    passportInput.addEventListener("change", () => {
      if (passportInput.files.length > 0) {
        state.passportFileSelected = true;
        const box = document.getElementById("passport-upload-box");
        box.classList.add("uploaded");
        document.getElementById("passport-upload-status").style.display = "block";
        document.getElementById("passport-upload-status").textContent = `✅ ${passportInput.files[0].name}`;
      }
    });

    visaInput.addEventListener("change", () => {
      if (visaInput.files.length > 0) {
        state.visaFileSelected = true;
        const box = document.getElementById("visa-upload-box");
        box.classList.add("uploaded");
        document.getElementById("visa-upload-status").style.display = "block";
        document.getElementById("visa-upload-status").textContent = `✅ ${visaInput.files[0].name}`;
      }
    });
  }

  // ============================================================
  // KYC WIZARD
  // ============================================================
  function setupKycWizard() {
    const nextBtn = document.getElementById("kyc-next-btn");
    const backBtn = document.getElementById("kyc-back-btn");

    nextBtn.addEventListener("click", async () => {
      if (state.isSubmitting || state.isUploadingOcr) return;
      if (!validateKycStep(state.kycStep)) return;

      if (state.kycStep === 2) {
        // Trigger OCR upload before advancing to step 3
        const success = await runOcrUpload();
        if (!success) return;
        goToKycStep(3);
        return;
      }

      if (state.kycStep === 3) {
        // STRICT: Block if there are critical OCR errors (bad image, passport mismatch, etc.)
        if (state.ocrHasCriticalError) {
          showToast("Danger", "Cannot proceed: critical document verification errors must be resolved.");
          document.getElementById("ocr-mismatch-warning").style.display = "block";
          return;
        }
        // Warn on non-critical mismatches
        if (!state.ocrValidationPassed && state.ocrValidationErrors.length > 0) {
          showToast("Warning", "Please review the highlighted mismatches before proceeding.");
          document.getElementById("ocr-mismatch-warning").style.display = "block";
          return;
        }
        goToKycStep(4);
        return;
      }

      if (state.kycStep < 6) {
        goToKycStep(state.kycStep + 1);
      } else if (state.kycStep === 6) {
        // Final submission
        goToKycStep(7);
        submitKyc();
      }
    });

    backBtn.addEventListener("click", () => {
      if (state.kycStep > 1 && state.kycStep < 7) {
        goToKycStep(state.kycStep - 1);
      }
    });

    // Retry button on error state
    document.getElementById("kyc-retry-btn").addEventListener("click", () => {
      goToKycStep(6);
    });

    // Camera capture
    document.getElementById("kyc-capture-btn").addEventListener("click", handleCameraCapture);
    document.getElementById("kyc-retake-btn").addEventListener("click", retakeSelfie);
  }

  function goToKycStep(step) {
    // Hide current, release camera if leaving step 4
    if (state.kycStep === 4 && step !== 4) releaseCameraStream();

    document.querySelector(`#kyc-step-${state.kycStep}`).classList.remove("active");
    document.querySelector(`.kyc-step-dot[data-step="${state.kycStep}"]`).classList.remove("active");

    state.kycStep = step;

    document.querySelector(`#kyc-step-${state.kycStep}`).classList.add("active");
    document.querySelector(`.kyc-step-dot[data-step="${state.kycStep}"]`).classList.add("active");

    const stepLabels = {
      1: "Step 1 of 7 — Personal Information",
      2: "Step 2 of 7 — Document Upload",
      3: "Step 3 of 7 — OCR Verification",
      4: "Step 4 of 7 — Identity Selfie",
      5: "Step 5 of 7 — Emergency Contact",
      6: "Step 6 of 7 — Set Password",
      7: "Step 7 of 7 — Submitting Registration"
    };
    document.getElementById("kyc-step-label").textContent = stepLabels[step] || `Step ${step} of ${TOTAL_KYC_STEPS}`;

    // Show/hide nav buttons
    const nav = document.getElementById("kyc-nav");
    if (step === 7) {
      nav.style.display = "none";
    } else {
      nav.style.display = "flex";
      document.getElementById("kyc-back-btn").style.display = step === 1 ? "none" : "block";
      const nextBtn = document.getElementById("kyc-next-btn");
      nextBtn.textContent = step === 6 ? "🚀 Submit KYC Registration" : "Continue →";

      // Always reset Next button state on step change to prevent deadlocks
      nextBtn.disabled = false;
      nextBtn.style.opacity = "";
      nextBtn.style.cursor = "";

      // If entering step 3, re-render OCR results to ensure button state matches error state
      if (step === 3) {
        renderOcrResults();
      }
    }
  }

  // ============================================================
  // STEP VALIDATION
  // ============================================================
  function validateKycStep(step) {
    const textRegex = /^[A-Za-z\s]+$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9\s+]+$/;
    const passportRegex = /^[A-Za-z0-9]+$/;

    if (step === 1) {
      if (!v("kyc-firstname")) return err("First name is required.");
      if (!textRegex.test(document.getElementById("kyc-firstname").value.trim())) return err("First name must contain text only.");

      if (!v("kyc-middlename")) return err("Middle name is required.");
      if (!textRegex.test(document.getElementById("kyc-middlename").value.trim())) return err("Middle name must contain text only.");

      if (!v("kyc-lastname")) return err("Last name is required.");
      if (!textRegex.test(document.getElementById("kyc-lastname").value.trim())) return err("Last name must contain text only.");

      if (!v("kyc-nationality")) return err("Nationality is required.");
      if (!textRegex.test(document.getElementById("kyc-nationality").value.trim())) return err("Nationality must contain text only.");

      if (!v("kyc-dob")) return err("Date of birth is required.");
      if (isNaN(Date.parse(document.getElementById("kyc-dob").value))) return err("Valid date of birth is required.");

      if (!v("kyc-email")) return err("Email address is required.");
      if (!emailRegex.test(document.getElementById("kyc-email").value.trim())) return err("Valid email address is required.");

      if (!v("kyc-mobile")) return err("Mobile number is required.");
      if (!phoneRegex.test(document.getElementById("kyc-mobile").value.trim())) return err("Mobile number must contain numbers only.");
    }
    if (step === 2) {
      if (!v("kyc-passport")) return err("Passport number is required.");
      if (!passportRegex.test(document.getElementById("kyc-passport").value.trim())) return err("Passport number must be alphanumeric.");

      if (!v("kyc-passport-expiry")) return err("Passport expiry date is required.");
      if (isNaN(Date.parse(document.getElementById("kyc-passport-expiry").value))) return err("Valid passport expiry date is required.");

      if (!state.passportFileSelected) return err("Please upload your passport scan. This is required for OCR verification.");
    }
    if (step === 3) {
      // Validation handled inline with OCR mismatch check
    }
    if (step === 4) {
      if (!state.selfieCaptured) return err("Please capture your selfie to proceed.");
      if (!state.faceAuthPassed) return err("Face authentication fails! Please capture a valid selfie.");
    }
    if (step === 5) {
      if (!v("kyc-emg-name")) return err("Emergency contact name is required.");
      if (!textRegex.test(document.getElementById("kyc-emg-name").value.trim())) return err("Emergency contact name must contain text only.");

      if (!v("kyc-emg-phone")) return err("Emergency contact phone is required.");
      if (!phoneRegex.test(document.getElementById("kyc-emg-phone").value.trim())) return err("Emergency contact phone must contain numbers only.");
    }
    if (step === 6) {
      const pw = document.getElementById("kyc-password").value;
      const conf = document.getElementById("kyc-password-confirm").value;
      if (!pw || pw.length < 6) return err("Password must be at least 6 characters.");
      if (pw !== conf) {
        document.getElementById("kyc-pw-error").style.display = "block";
        return false;
      }
      document.getElementById("kyc-pw-error").style.display = "none";
    }
    return true;
  }

  function v(id) {
    const el = document.getElementById(id);
    return el && el.value && el.value.trim().length > 0;
  }

  function err(msg) {
    showToast("Warning", msg);
    return false;
  }

  // ============================================================
  // OCR UPLOAD (Step 2 → Step 3)
  // ============================================================
  async function runOcrUpload() {
    state.isUploadingOcr = true;
    const progressEl = document.getElementById("kyc-upload-progress");
    const progressBar = document.getElementById("ocr-progress-bar");
    const errorEl = document.getElementById("kyc-upload-error");
    errorEl.style.display = "none";
    progressEl.style.display = "block";

    // Animate progress bar
    let pct = 0;
    const progressInterval = setInterval(() => {
      pct = Math.min(pct + 3, 90);
      progressBar.style.width = pct + "%";
    }, 600);

    try {
      const formData = new FormData();
      const passportFile = document.getElementById("kyc-passport-file").files[0];
      const visaFile = document.getElementById("kyc-visa-file").files[0];

      formData.append("passportFile", passportFile);
      if (visaFile) formData.append("visaFile", visaFile);

      // Add user-entered data for comparison
      const fullName = `${document.getElementById("kyc-firstname").value.trim()} ${document.getElementById("kyc-middlename").value.trim()} ${document.getElementById("kyc-lastname").value.trim()}`.replace(/\s+/g, ' ').trim();
      formData.append("fullName", fullName);
      formData.append("passportNo", document.getElementById("kyc-passport").value.trim());
      formData.append("passportExpiry", document.getElementById("kyc-passport-expiry").value);
      formData.append("dob", document.getElementById("kyc-dob").value);
      formData.append("nationality", document.getElementById("kyc-nationality").value.trim());

      const res = await fetch("/api/kyc/upload", { method: "POST", body: formData });
      const data = await res.json();

      clearInterval(progressInterval);
      progressBar.style.width = "100%";

      if (!res.ok) throw new Error(data.error || "OCR processing failed.");

      state.ocrData = data.ocrData;
      state.ocrValidationErrors = data.validationErrors;
      state.ocrValidationPassed = data.validationPassed;
      state.ocrHasCriticalError = data.hasCriticalError || false;
      state.ocrDocumentUnreadable = data.documentUnreadable || false;
      state.ocrStages = data.stages || [];
      state.ocrComparisons = data.comparisons || [];
      state.ocrOverallStatus = data.overallStatus || "pending";
      state.tempFiles = data.tempFiles;

      setTimeout(() => { progressEl.style.display = "none"; progressBar.style.width = "0%"; }, 500);
      renderOcrResults();
      state.isUploadingOcr = false;
      return true;
    } catch (err) {
      clearInterval(progressInterval);
      progressEl.style.display = "none";
      progressBar.style.width = "0%";
      // If network/server error — treat as hard failure
      errorEl.innerHTML = `<strong>⚠️ Error:</strong> ${err.message}`;
      errorEl.style.display = "block";
      state.ocrData = null;
      state.ocrValidationErrors = [];
      state.ocrValidationPassed = false;
      state.ocrHasCriticalError = true;
      state.ocrDocumentUnreadable = true;
      state.tempFiles = null;
      state.isUploadingOcr = false;
      showToast("Danger", "Document upload failed: " + err.message);
      return true; // Still go to step 3 to show the error properly
    }
  }

  // ============================================================
  // RENDER OCR RESULTS (Step 3)
  // ============================================================
  function renderOcrResults() {
    const container = document.getElementById("ocr-compare-container");
    const statusBanner = document.getElementById("ocr-status-banner");
    const statusText = document.getElementById("ocr-status-text");
    const mismatchWarning = document.getElementById("ocr-mismatch-warning");
    const noDataMsg = document.getElementById("ocr-no-data-msg");
    const mrzSection = document.getElementById("ocr-mrz-section");
    const nextBtn = document.getElementById("kyc-next-btn");

    container.innerHTML = "";
    mismatchWarning.style.display = "none";

    const ocr = state.ocrData;
    const stages = state.ocrStages || [];
    const comparisons = state.ocrComparisons || [];
    const errors = state.ocrValidationErrors;
    const criticalErrors = errors.filter(e => e.critical);

    // Remove Pipeline Stages & MRZ UI completely for a cleaner look
    mrzSection.style.display = "none";

    // CASE 1: Document unreadable — hard block
    if (state.ocrDocumentUnreadable || (state.ocrOverallStatus === "failed" && !ocr)) {
      noDataMsg.style.display = "none";
      statusBanner.className = "ocr-status-banner fail";
      statusBanner.style.justifyContent = "center";
      statusText.innerHTML = "<strong>INVALID DETAILS!</strong>";
      mismatchWarning.style.display = "none";
      nextBtn.disabled = true;
      nextBtn.style.opacity = "0.4";
      nextBtn.style.cursor = "not-allowed";
      return;
    }

    noDataMsg.style.display = "none";
    container.style.display = "block";
    nextBtn.disabled = false;
    nextBtn.style.opacity = "";
    nextBtn.style.cursor = "";
    nextBtn.title = "";

    container.innerHTML = `<div class="ocr-section-title">📄 Verification Results</div>`;

    // Render Comparisons
    comparisons.forEach(c => {
      const isMismatch = c.status === "mismatch" || c.status === "critical_mismatch" || c.status === "expired" || c.status === "not_extracted";
      const isCritical = c.critical;
      
      let icon = "✅";
      if (c.status === "critical_mismatch" || c.status === "expired") icon = "🚫";
      else if (isMismatch || c.status === "low_confidence") icon = "⚠️";

      const row = document.createElement("div");
      row.className = `ocr-field-row ${isMismatch ? "mismatch" : "match"}`;
      if (isCritical) row.style.border = "2px solid var(--danger)";
      
      row.innerHTML = `
        <div class="ocr-field-label">
          ${c.label}
        </div>
        <div class="ocr-field-msg" style="${isCritical ? 'color:var(--danger);' : isMismatch ? 'color:var(--warning);' : 'color:var(--success);'}">
          ${icon} ${c.message}
        </div>
      `;
      container.appendChild(row);
    });

    // Update status banner
    if (state.ocrHasCriticalError) {
      statusBanner.className = "ocr-status-banner fail";
      statusBanner.style.justifyContent = "center";
      statusText.innerHTML = `<strong>INVALID DETAILS!</strong>`;
      mismatchWarning.style.display = "none";
      nextBtn.disabled = true;
      nextBtn.style.opacity = "0.4";
      nextBtn.style.cursor = "not-allowed";
    } else if (state.ocrOverallStatus === "manual_review") {
      statusBanner.className = "ocr-status-banner warn";
      statusBanner.style.justifyContent = "center";
      statusText.innerHTML = `<strong>MANUAL REVIEW REQUIRED</strong>`;
      mismatchWarning.style.display = "block";
      // Ensure Next button remains enabled
      nextBtn.disabled = false;
      nextBtn.style.opacity = "";
      nextBtn.style.cursor = "";
    } else {
      statusBanner.className = "ocr-status-banner ok";
      statusText.innerHTML = "<strong>document verified</strong>";
      mismatchWarning.style.display = "none";
    }
  }

  // ============================================================
  // CAMERA (Step 4)
  // ============================================================
  async function handleCameraCapture() {
    const captureBtn = document.getElementById("kyc-capture-btn");
    const stream = document.getElementById("kyc-camera-stream");
    const faceIcon = document.querySelector(".kyc-face-icon");
    const statusEl = document.getElementById("kyc-scan-status");

    if (!state.cameraStream) {
      // Start camera
      try {
        captureBtn.disabled = true;
        captureBtn.textContent = "📷 Starting camera...";
        statusEl.textContent = "Requesting camera access...";
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        state.cameraStream = mediaStream;
        stream.srcObject = mediaStream;
        stream.style.display = "block";
        faceIcon.style.display = "none";
        captureBtn.disabled = false;
        captureBtn.textContent = "📸 Capture Selfie";
        statusEl.textContent = "Camera active — position your face and click Capture";
      } catch (err) {
        captureBtn.disabled = false;
        captureBtn.textContent = "📸 Start Camera & Capture Selfie";
        statusEl.textContent = "Camera not available — selfie is optional.";
        showToast("Warning", "Camera access denied. Selfie is optional.");
        state.selfieCaptured = false;
      }
    } else {
      // Capture snapshot
      const canvas = document.createElement("canvas");
      canvas.width = stream.videoWidth || 320;
      canvas.height = stream.videoHeight || 320;
      canvas.getContext("2d").drawImage(stream, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      state.selfieDataUrl = dataUrl;
      state.selfieCaptured = true;
      state.faceAuthPassed = false;

      // Show captured image
      const capturedImg = document.getElementById("kyc-captured-image");
      capturedImg.src = dataUrl;
      capturedImg.style.display = "block";
      stream.style.display = "none";

      releaseCameraStream();

      captureBtn.style.display = "none";
      document.getElementById("kyc-retake-btn").style.display = "block";
      const resultEl = document.getElementById("kyc-face-result");
      resultEl.style.display = "block";
      resultEl.style.color = "var(--text-secondary)";
      resultEl.innerHTML = "⏳ Authenticating face...";
      statusEl.textContent = "Scanning face, please wait...";
      
      // Call Face Match API
      try {
        const nextBtn = document.getElementById("kyc-next-btn");
        nextBtn.disabled = true;
        nextBtn.style.opacity = "0.4";
        nextBtn.style.cursor = "not-allowed";

        const blob = await (await fetch(dataUrl)).blob();
        const formData = new FormData();
        formData.append("selfieFile", blob, "selfie.jpg");
        const res = await fetch("/api/kyc/face-match", { method: "POST", body: formData });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || "Face authentication fails!");
        
        state.faceAuthPassed = true;
        resultEl.style.color = "var(--safe)";
        resultEl.innerHTML = "✅ Face Authentication Successful";
        statusEl.textContent = "You can now proceed to the next step.";
        nextBtn.disabled = false;
        nextBtn.style.opacity = "";
        nextBtn.style.cursor = "";
      } catch (err) {
        state.faceAuthPassed = false;
        resultEl.style.color = "var(--danger)";
        resultEl.innerHTML = `🚨 Face verification failed! Please try again!`;
        statusEl.textContent = "Ensure good lighting and that your face is clearly visible.";
        showToast("Danger", "Face verification failed! Please try again!");
        
        document.getElementById("kyc-retake-btn").style.display = "block";
        
        const nextBtn = document.getElementById("kyc-next-btn");
        nextBtn.disabled = true;
        nextBtn.style.opacity = "0.4";
        nextBtn.style.cursor = "not-allowed";
      }
    }
  }

  function retakeSelfie() {
    state.cameraStream = null;
    state.selfieDataUrl = null;
    state.selfieCaptured = false;
    state.faceAuthPassed = false;

    const capturedImg = document.getElementById("kyc-captured-image");
    const stream = document.getElementById("kyc-camera-stream");
    const faceIcon = document.querySelector(".kyc-face-icon");

    capturedImg.style.display = "none";
    stream.style.display = "none";
    faceIcon.style.display = "block";

    document.getElementById("kyc-capture-btn").style.display = "block";
    document.getElementById("kyc-capture-btn").textContent = "📸 Start Camera & Capture Selfie";
    document.getElementById("kyc-retake-btn").style.display = "none";
    document.getElementById("kyc-face-result").style.display = "none";
    document.getElementById("kyc-scan-status").textContent = "Position your face inside the frame";
  }

  function releaseCameraStream() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(track => track.stop());
      state.cameraStream = null;
      const streamEl = document.getElementById("kyc-camera-stream");
      if (streamEl) streamEl.srcObject = null;
    }
  }

  // ============================================================
  // FINAL KYC SUBMISSION
  // ============================================================
  async function submitKyc() {
    state.isSubmitting = true;
    document.getElementById("kyc-submitting-state").style.display = "block";
    document.getElementById("kyc-success-state").style.display = "none";
    document.getElementById("kyc-error-state").style.display = "none";

    try {
      const fullName = `${document.getElementById("kyc-firstname").value.trim()} ${document.getElementById("kyc-middlename").value.trim()} ${document.getElementById("kyc-lastname").value.trim()}`.replace(/\s+/g, ' ').trim();
      
      const payload = {
        fullName: fullName,
        email: document.getElementById("kyc-email").value.trim(),
        mobileNumber: document.getElementById("kyc-mobile").value.trim(),
        passwordHash: document.getElementById("kyc-password").value,
        dateOfBirth: document.getElementById("kyc-dob").value,
        nationality: document.getElementById("kyc-nationality").value.trim(),
        passportNo: document.getElementById("kyc-passport").value.trim(),
        passportExpiry: document.getElementById("kyc-passport-expiry").value,
        visaNo: document.getElementById("kyc-visa").value.trim(),
        visaExpiry: document.getElementById("kyc-visaexpiry").value,
        emergencyContactName: document.getElementById("kyc-emg-name").value.trim(),
        emergencyContactPhone: document.getElementById("kyc-emg-phone").value.trim(),
        emergencyContactName2: document.getElementById("kyc-emg-name-2") ? document.getElementById("kyc-emg-name-2").value.trim() : "",
        emergencyContactPhone2: document.getElementById("kyc-emg-phone-2") ? document.getElementById("kyc-emg-phone-2").value.trim() : "",
        emergencyContactName3: document.getElementById("kyc-emg-name-3") ? document.getElementById("kyc-emg-name-3").value.trim() : "",
        emergencyContactPhone3: document.getElementById("kyc-emg-phone-3") ? document.getElementById("kyc-emg-phone-3").value.trim() : "",
        ocrData: state.ocrData,
        validationErrors: state.ocrValidationErrors,
        validationPassed: state.ocrValidationPassed,
        tempFiles: state.tempFiles
      };

      // If selfie was captured, include it as base64
      if (state.selfieCaptured && state.selfieDataUrl) {
        // Upload selfie separately as part of form data
        const selfieBlob = await (await fetch(state.selfieDataUrl)).blob();
        const selfieForm = new FormData();
        selfieForm.append("selfieFile", selfieBlob, "selfie.jpg");
        selfieForm.append("fullName", payload.fullName);
        selfieForm.append("passportNo", payload.passportNo);
        try {
          const selfieRes = await fetch("/api/kyc/upload", { method: "POST", body: selfieForm });
          const selfieData = await selfieRes.json();
          if (selfieData.tempFiles?.selfiePath) {
            if (!payload.tempFiles) payload.tempFiles = {};
            payload.tempFiles.selfiePath = selfieData.tempFiles.selfiePath;
          }
        } catch (e) {
          console.warn("[KYC] Selfie upload failed:", e.message);
        }
      }

      const res = await fetch("/api/kyc/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Registration failed.");

      state.isSubmitting = false;
      document.getElementById("kyc-submitting-state").style.display = "none";
      document.getElementById("kyc-success-state").style.display = "block";
      document.getElementById("kyc-issued-id").textContent = data.touristId;
      showToast("Safe", `Registered! Tourist ID: ${data.touristId}. Pending admin review.`);

    } catch (err) {
      state.isSubmitting = false;
      console.error("[KYC Submit] Error:", err);
      document.getElementById("kyc-submitting-state").style.display = "none";
      document.getElementById("kyc-error-state").style.display = "block";
      document.getElementById("kyc-submit-error-msg").textContent = err.message;
      showToast("Danger", "Registration failed: " + err.message);
    }
  }

  // ============================================================
  // TOAST NOTIFIER
  // ============================================================
  function showToast(level, message) {
    const container = document.getElementById("toast-notifications-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${level}`;
    const icons = { Danger: "🚨", Warning: "⚠️", Safe: "✅", Info: "🔔" };
    toast.innerHTML = `<span style="font-size:16px;">${icons[level] || "🔔"}</span><div>${message}</div>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(50px)";
      toast.style.transition = "all 0.4s ease-out";
      setTimeout(() => { if (container.contains(toast)) container.removeChild(toast); }, 400);
    }, 5000);
  }

  // Release camera on page unload
  window.addEventListener("beforeunload", releaseCameraStream);

  init();
});

window.togglePassword = function(id, el) {
  const input = document.getElementById(id);
  if (input.type === 'password') {
    input.type = 'text';
    el.innerText = '👁️‍🗨️';
  } else {
    input.type = 'password';
    el.innerText = '👁️';
  }
};
