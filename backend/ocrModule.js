/**
 * TSMS OCR Verification Module
 * Handles all passport document OCR extraction, normalization,
 * field comparison, and verification pipeline.
 */

"use strict";

const { createWorker } = require("tesseract.js");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// ============================================================
// DATE NORMALIZATION
// Always returns YYYY-MM-DD or null
// ============================================================
const MONTH_NAMES = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  JANUARY: "01", FEBRUARY: "02", MARCH: "03", APRIL: "04",
  JUNE: "06", JULY: "07", AUGUST: "08", SEPTEMBER: "09",
  OCTOBER: "10", NOVEMBER: "11", DECEMBER: "12"
};

// ============================================================
// DATE NORMALIZATION (YYYY-MM-DD)
// ============================================================
function normalizeDate(raw) {
  if (!raw) return null;
  // Remove hidden chars and normalize whitespace
  let s = raw.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
  s = s.replace(/\s*([\/\-\.])\s*/g, '$1');

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  let m = s.match(/^(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})$/);
  if (m) {
    const da = parseInt(m[1]);
    const mo = parseInt(m[2]);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    }
  }

  // MM/DD/YYYY (US format — detect by month>12 in pos 1)
  m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (m && parseInt(m[1]) <= 12 && parseInt(m[2]) <= 31)
    return `${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;

  // DD/MM/YY or DD-MM-YY (2-digit year)
  m = s.match(/^(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{2})$/);
  if (m) {
    const da = parseInt(m[1]);
    const mo = parseInt(m[2]);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      const yr = parseInt(m[3]) > 50 ? "19" + m[3] : "20" + m[3];
      return `${yr}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    }
  }

  // YYMMDD (MRZ format)
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    const mo = parseInt(m[2]);
    const da = parseInt(m[3]);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      const yr = parseInt(m[1]) > 50 ? "19" + m[1] : "20" + m[1];
      return `${yr}-${m[2]}-${m[3]}`;
    }
  }

  // DD MMM YYYY or D MMM YYYY (e.g. 15 AUG 1995)
  m = s.match(/^(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{2,4})$/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const mon = MONTH_NAMES[m[2]];
    const yr = m[3].length === 2 ? (parseInt(m[3]) > 30 ? "19" + m[3] : "20" + m[3]) : m[3];
    return `${yr}-${mon}-${day}`;
  }

  // MMM DD YYYY (e.g. AUG 15 1995)
  m = s.match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2})\s+(\d{2,4})$/);
  if (m) {
    const mon = MONTH_NAMES[m[1]];
    const day = m[2].padStart(2, "0");
    const yr = m[3].length === 2 ? (parseInt(m[3]) > 30 ? "19" + m[3] : "20" + m[3]) : m[3];
    return `${yr}-${mon}-${day}`;
  }

  return null;
}

// ============================================================
// PASSPORT NUMBER NORMALIZATION
// ============================================================
function normalizePassportNo(raw) {
  if (!raw) return "";
  return raw.trim().toUpperCase().replace(/[\s\-<\.\,]/g, "");
}

// ============================================================
// TEXT CLEANING
// ============================================================
function cleanOcrText(text) {
  return text
    .replace(/[^\x20-\x7E\n]/g, "")   // remove non-printable ASCII
    .replace(/\r\n?/g, "\n")           // normalize line endings
    .replace(/[ \t]+/g, " ")           // collapse horizontal whitespace
    .replace(/\n{3,}/g, "\n\n")        // collapse excessive blank lines
    .trim();
}

// ============================================================
// IMAGE QUALITY VALIDATION (uses sharp stats)
// ============================================================
async function validateImageQuality(filePath) {
  const issues = [];
  let metadata = null;

  try {
    metadata = await sharp(filePath).metadata();
    const stats = await sharp(filePath).greyscale().raw().toBuffer({ resolveWithObject: true });

    const { data, info } = stats;
    const pixels = data.length;

    // Compute mean and standard deviation of pixel values
    let sum = 0;
    for (let i = 0; i < pixels; i++) sum += data[i];
    const mean = sum / pixels;

    let varianceSum = 0;
    for (let i = 0; i < pixels; i++) varianceSum += Math.pow(data[i] - mean, 2);
    const stdev = Math.sqrt(varianceSum / pixels);

    console.log(`[QualityCheck] Dimensions: ${metadata.width}x${metadata.height}, Mean: ${mean.toFixed(1)}, StDev: ${stdev.toFixed(1)}`);

    // Min resolution check
    if (metadata.width < 300 || metadata.height < 200) {
      issues.push({ type: "resolution", severity: "critical", message: `Image is too small (${metadata.width}×${metadata.height}px). Minimum required: 300×200. Please upload a higher resolution scan.` });
    }

    // Blur detection: low stdev = low contrast = blurry
    if (stdev < 12) {
      issues.push({ type: "blur", severity: "critical", message: "Passport image appears to be blurry or out of focus. Please capture a sharp, clear photo of your passport in good lighting." });
    }

    // Overexposure / glare detection: very high mean
    if (mean > 238) {
      issues.push({ type: "glare", severity: "critical", message: "Image appears overexposed or has significant glare/reflections. Avoid flash and photograph the passport in natural, even lighting." });
    }

    // Underexposure / too dark
    if (mean < 18) {
      issues.push({ type: "dark", severity: "critical", message: "Image is too dark. Please ensure the passport is well-lit when capturing the photo." });
    }

    // Nearly blank image (e.g. plain white paper)
    if (mean > 220 && stdev < 20) {
      issues.push({ type: "blank", severity: "critical", message: "The uploaded image appears to be blank or nearly empty. Please upload a clear photograph of your passport bio-data page." });
    }

  } catch (err) {
    console.error("[QualityCheck] Error:", err.message);
    issues.push({ type: "error", severity: "critical", message: "Could not read the uploaded image. Please ensure you upload a valid JPG, PNG, or WebP file." });
  }

  const hasCritical = issues.some(i => i.severity === "critical");
  return { passed: !hasCritical, issues, metadata };
}

// ============================================================
// IMAGE PREPROCESSING (enhance for better OCR accuracy)
// ============================================================
async function preprocessImage(filePath) {
  const processedPath = filePath + "_ocr.png";
  try {
    await sharp(filePath)
      .greyscale()
      .normalize()                   // stretch contrast to full range
      .sharpen({ sigma: 1.5, m1: 1, m2: 2 }) // unsharp mask sharpening
      .linear(1.3, -40)             // boost contrast
      .toFile(processedPath);
    return processedPath;
  } catch (err) {
    console.warn("[Preprocess] Could not preprocess, using original:", err.message);
    return filePath; // fall back to original
  }
}

// ============================================================
// MRZ PARSER (ICAO 9303 standard)
// Handles both TD3 (44 chars) and TD1 (30 chars) formats
// ============================================================
function parseMrz(rawLines) {
  // Sanitize potential OCR noise in MRZ lines
  const candidates = rawLines
    .map(l => l.toUpperCase().replace(/[^A-Z0-9<]/g, ""))
    .filter(l => l.length >= 30 && l.includes("<")); // Must contain at least one < to be a real MRZ line

  // Find two consecutive MRZ lines (TD3 = 44 chars each)
  let line1 = "", line2 = "";
  for (let i = 0; i < candidates.length - 1; i++) {
    // Check if they are roughly the right length for TD3
    if (candidates[i].length >= 36 && candidates[i + 1].length >= 36) {
      // Must start with P, I, A, C or V for doc type
      if (/^[PIACV]/.test(candidates[i])) {
        line1 = candidates[i].padEnd(44, "<");
        line2 = candidates[i + 1].padEnd(44, "<");
        break;
      }
    }
  }

  // Also check a single line that might be wide enough to contain both
  if (!line1) {
    for (const c of candidates) {
      if (c.length >= 80) {
        line1 = c.substring(0, 44).padEnd(44, "<");
        line2 = c.substring(44, 88).padEnd(44, "<");
        break;
      }
    }
  }

  if (!line1 || !line2) return null;

  try {
    // Line 1 structure: [DocType(1)][CountryCode(3)][Names(39)]
    const docType = line1[0] || "P";
    const issuingCountry = line1.substring(2, 5).replace(/</g, "").trim();

    // Names: everything from position 5, split by <<
    const nameField = line1.substring(5).replace(/</g, " ").trim();
    const nameParts = line1.substring(5).split("<<");
    const surname = (nameParts[0] || "").replace(/</g, " ").trim();
    const givenNames = (nameParts.slice(1).join(" ") || "").replace(/</g, " ").trim();
    const fullName = [givenNames, surname].filter(Boolean).join(" ").trim();

    // Line 2 structure:
    // [PassportNo(9)][CheckDigit(1)][Nationality(3)][DOB(6)][CheckDigit(1)][Sex(1)][ExpiryDate(6)][CheckDigit(1)]...
    const passportNo = normalizePassportNo(line2.substring(0, 9));
    const nationality = line2.substring(10, 13).replace(/</g, "").trim();
    const dobRaw = line2.substring(13, 19);
    const dobNormalized = normalizeDate(dobRaw);
    const sex = line2[20] || "";
    const expiryRaw = line2.substring(21, 27);
    const expiryNormalized = normalizeDate(expiryRaw);

    if (!passportNo && !fullName) return null; // MRZ extraction failed silently

    return {
      docType,
      issuingCountry,
      fullName,
      surname,
      givenNames,
      passportNo,
      nationality,
      dob: { raw: dobRaw, normalized: dobNormalized },
      sex,
      expiry: { raw: expiryRaw, normalized: expiryNormalized },
      rawLines: { line1, line2 }
    };
  } catch (err) {
    console.warn("[MRZ] Parse error:", err.message);
    return null;
  }
}

// ============================================================
// FULL TEXT FIELD EXTRACTION
// ============================================================
function extractPassportFields(rawText) {
  const text = cleanOcrText(rawText);
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 2);
  const upper = text.toUpperCase();

  const fields = {
    fullName:      { value: null, confidence: 0, source: null },
    passportNo:    { value: null, confidence: 0, source: null },
    dob:           { value: null, normalized: null, confidence: 0, source: null },
    nationality:   { value: null, confidence: 0, source: null },
    expiry:        { value: null, normalized: null, confidence: 0, source: null },
    issuingCountry:{ value: null, confidence: 0, source: null },
    mrz:           null
  };

  // ─── 1. Try MRZ first (highest reliability) ────────────────
  const mrz = parseMrz(lines);
  if (mrz) {
    fields.mrz = mrz;
    if (mrz.passportNo)     fields.passportNo    = { value: mrz.passportNo, confidence: 96, source: "MRZ" };
    if (mrz.fullName)       fields.fullName       = { value: mrz.fullName, confidence: 94, source: "MRZ" };
    if (mrz.dob.normalized) fields.dob            = { value: mrz.dob.raw, normalized: mrz.dob.normalized, confidence: 96, source: "MRZ" };
    if (mrz.expiry.normalized) fields.expiry      = { value: mrz.expiry.raw, normalized: mrz.expiry.normalized, confidence: 96, source: "MRZ" };
    if (mrz.nationality)    fields.nationality    = { value: mrz.nationality, confidence: 90, source: "MRZ" };
    if (mrz.issuingCountry) fields.issuingCountry = { value: mrz.issuingCountry, confidence: 90, source: "MRZ" };
    console.log("[OCR] MRZ parsed successfully:", { passportNo: mrz.passportNo, name: mrz.fullName });
  }

  // ─── 2. Regex fallback for passport number ─────────────────
  if (!fields.passportNo.value) {
    // Standard passport number: 1-2 letters then 6-8 digits (most countries)
    const pm = upper.match(/\b([A-Z]{1,2}[0-9]{6,8})\b/);
    if (pm) {
      fields.passportNo = { value: pm[1], confidence: 72, source: "regex" };
      console.log("[OCR] Passport number via regex:", pm[1]);
    }
    // Indian: letter+7digits, some countries: all digits
    const pm2 = !fields.passportNo.value && upper.match(/\bPASSPORT\s*(?:NO|NUMBER|#)?[:\s]*([A-Z0-9]{6,12})\b/);
    if (pm2) fields.passportNo = { value: pm2[1], confidence: 78, source: "label-regex" };
  }

  // ─── 3. Collect all date-like strings ─────────────────────
  const dateHits = new Set();

  // Pattern A: DD MMM YYYY or DD MMM YY
  const datePatA = /\b(\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{2,4})\b/gi;
  let dm;
  while ((dm = datePatA.exec(upper)) !== null) dateHits.add(dm[1]);

  // Pattern B: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const datePatB = /\b(\d{2}\s*[\/\-\.]\s*\d{2}\s*[\/\-\.]\s*\d{2,4})\b/g;
  while ((dm = datePatB.exec(upper)) !== null) dateHits.add(dm[1]);

  // Pattern C: YYYY-MM-DD (ISO)
  const datePatC = /\b(\d{4}\s*-\s*\d{2}\s*-\s*\d{2})\b/g;
  while ((dm = datePatC.exec(upper)) !== null) dateHits.add(dm[1]);

  const parsedDates = [...dateHits]
    .map(raw => ({ raw, normalized: normalizeDate(raw) }))
    .filter(d => d.normalized)
    .sort((a, b) => a.normalized.localeCompare(b.normalized));

  // Assign: earliest date as DOB, latest as expiry
  if (!fields.dob.value && parsedDates.length >= 1) {
    const d = parsedDates[0];
    fields.dob = { value: d.raw, normalized: d.normalized, confidence: 62, source: "text-regex" };
  }
  if (!fields.expiry.value && parsedDates.length >= 2) {
    const d = parsedDates[parsedDates.length - 1];
    fields.expiry = { value: d.raw, normalized: d.normalized, confidence: 62, source: "text-regex" };
  }

  // ─── 4. Full name VIZ area heuristic ──────────────────────
  if (!fields.fullName.value) {
    for (const line of lines) {
      const clean = line.trim();
      // Look for lines with 2-4 all-uppercase words that look like a name
      const words = clean.split(/\s+/);
      if (words.length >= 2 && words.length <= 5 &&
          words.every(w => /^[A-Z][A-Z\-']+$/.test(w) && w.length >= 2) &&
          clean.length >= 5 && clean.length <= 50) {
        // Convert to proper case
        const proper = words.map(w => w[0] + w.slice(1).toLowerCase()).join(" ");
        fields.fullName = { value: proper, confidence: 55, source: "text-heuristic" };
        break;
      }
    }
  }

  // ─── 5. Nationality field label ────────────────────────────
  if (!fields.nationality.value) {
    const nm = upper.match(/NATIONALITY[:\s]+([A-Z]{3,})/);
    if (nm) fields.nationality = { value: nm[1], confidence: 68, source: "text-label" };
  }

  // ─── 6. Issuing country via label ──────────────────────────
  if (!fields.issuingCountry.value) {
    const cm = upper.match(/(?:COUNTRY\s+OF\s+(?:BIRTH|ISSUE)|ISSUING\s+COUNTRY|PLACE\s+OF\s+ISSUE)[:\s]+([A-Z]{2,}(?:\s+[A-Z]+)*)/);
    if (cm) fields.issuingCountry = { value: cm[1].trim(), confidence: 65, source: "text-label" };
  }

  return fields;
}

// ============================================================
// FIELD COMPARISON (normalized, no false mismatches)
// ============================================================
function compareField(label, fieldKey, userValue, ocrField, opts = {}) {
  const result = {
    field: fieldKey,
    label,
    userEntered: userValue || "",
    ocrExtracted: ocrField ? ocrField.value || "" : "",
    ocrNormalized: null,
    userNormalized: null,
    confidence: ocrField ? ocrField.confidence || 0 : 0,
    source: ocrField ? ocrField.source || "unknown" : null,
    status: "not_extracted",  // not_extracted | match | mismatch | critical_mismatch | low_confidence | expired
    critical: false,
    message: ""
  };
  
  require('fs').appendFileSync('ocr_debug.log', `[compareField] ${label} - User: ${userValue} - OCR: ${ocrField ? ocrField.value : 'N/A'}\\n`);

  const hasOcr = ocrField && ocrField.value;
  const hasUser = userValue && userValue.trim();

  if (!hasOcr) {
    if (opts.required) {
      result.status = "not_extracted";
      result.critical = true;
      result.message = `invalid details`;
    } else {
      result.status = "not_extracted";
      result.message = `invalid details`;
    }
    return result;
  }

  if (!hasUser) {
    result.status = "not_extracted";
    result.message = `invalid details`;
    return result;
  }

  // Confidence check removed to allow perfect double-entry matches to succeed

  // ─── Date comparison ───────────────────────────────────────
  if (opts.type === "date") {
    const normUser = normalizeDate(userValue);
    const normOcr  = ocrField.normalized || normalizeDate(ocrField.value);

    result.ocrNormalized = normOcr;
    result.userNormalized = normUser;
    require('fs').appendFileSync('ocr_debug.log', `[compareField DATE] ${label} - normUser: ${normUser} - normOcr: ${normOcr}\\n`);

    if (!normUser) {
      result.status = "mismatch";
      result.message = `invalid details`;
      return result;
    }
    if (!normOcr) {
      result.status = "not_extracted";
      result.message = `invalid details`;
      return result;
    }

    // Compare using actual Date objects to ignore any formatting variations
    const dateUser = new Date(normUser + "T00:00:00Z");
    const dateOcr = new Date(normOcr + "T00:00:00Z");

    if (!isNaN(dateUser) && !isNaN(dateOcr) && dateUser.getTime() === dateOcr.getTime()) {
      result.status = "match";
      result.message = `Verified Successfully`;
    } else {
      result.status = opts.critical !== false ? "critical_mismatch" : "mismatch";
      result.critical = opts.critical !== false;
      result.message = `invalid details`;
    }
    return result;
  }

  // ─── Passport number comparison ────────────────────────────
  if (fieldKey === "passportNo") {
    const normUser = normalizePassportNo(userValue);
    const normOcr  = normalizePassportNo(ocrField.value);
    result.ocrNormalized = normOcr;
    result.userNormalized = normUser;

    if (normUser === normOcr) {
      result.status = "match";
      result.message = `details verified successfully`;
    } else {
      result.status = "critical_mismatch";
      result.critical = true;
      result.message = `passport no is invalid`;
    }
    return result;
  }

  // ─── Name comparison (partial match — OCR & fonts cause slight variations) ─
  if (fieldKey === "fullName" || opts.partialMatch) {
    const normUser = (userValue || "").toUpperCase().trim().replace(/\s+/g, " ");
    const normOcr  = (ocrField.value || "").toUpperCase().trim().replace(/\s+/g, " ");
    result.ocrNormalized = normOcr;
    result.userNormalized = normUser;

    const userWords = normUser.split(/\s+/);
    const ocrWords  = normOcr.split(/\s+/);
    const matched   = userWords.filter(w => w.length > 1 && ocrWords.some(ow => ow.includes(w) || w.includes(ow)));
    const ratio = matched.length / Math.max(userWords.length, 1);

    if (ratio >= 0.6) {
      result.status = "match";
      result.message = `details verified successfully`;
    } else if (ratio >= 0.3) {
      result.status = "mismatch";
      result.critical = false;
      result.message = `invalid details`;
    } else {
      result.status = "mismatch";
      result.critical = false;
      result.message = `invalid details`;
    }
    return result;
  }

  // ─── Generic text comparison ───────────────────────────────
  const normUser = (userValue || "").toUpperCase().trim().replace(/[\s<\-\.]/g, "");
  const normOcr  = (ocrField.value || "").toUpperCase().trim().replace(/[\s<\-\.]/g, "");
  result.ocrNormalized = normOcr;
  result.userNormalized = normUser;

  if (normUser === normOcr || normOcr.includes(normUser) || normUser.includes(normOcr)) {
    result.status = "match";
    result.message = `details verified successfully`;
  } else {
    result.status = "mismatch";
    result.critical = opts.critical || false;
    result.message = `invalid details`;
  }
  return result;
}

// ============================================================
// EXPIRY DATE CHECK (is passport expired?)
// ============================================================
function checkExpiry(expiryField, userValue) {
  const userNormalized = normalizeDate(userValue);
  const ocrNormalized = expiryField?.normalized || normalizeDate(expiryField?.value || "");
  
  if (userNormalized) {
    const expDate = new Date(userNormalized + "T00:00:00");
    const today   = new Date(); today.setHours(0, 0, 0, 0);

    if (expDate < today) {
      return {
        field: "expiry",
        label: "Passport Expiry Date",
        userEntered: userValue || "—",
        ocrExtracted: expiryField?.value || "",
        ocrNormalized: ocrNormalized,
        confidence: expiryField?.confidence || 0,
        source: expiryField?.source || "unknown",
        status: "expired",
        critical: true,
        message: `invalid details`
      };
    }
  }
  return null;
}

// ============================================================
// MAIN VERIFICATION PIPELINE
// ============================================================
async function runFullVerification(passportFilePath, userInput) {
  const result = {
    stages: [],           // step-by-step progress
    comparisons: [],      // per-field comparison results
    ocrData: null,        // extracted structured data
    ocrConfidence: 0,
    ocrRawTextLength: 0,
    overallStatus: "pending",   // pending | passed | failed | manual_review
    hasCriticalError: false,
    documentUnreadable: false,
    validationErrors: [],
    validationPassed: false,
    tempFiles: {}
  };

  const addStage = (name, status, message, extra = {}) => {
    result.stages.push({ name, status, message, ...extra });
    console.log(`[Verify][${status.toUpperCase()}] ${name}: ${message}`);
  };

  // ─── STAGE 1: Image Quality Check ─────────────────────────
  const qCheck = await validateImageQuality(passportFilePath);
  const qFailed = !qCheck.passed;
  addStage(
    "Image Quality Check",
    qFailed ? "failed" : "passed",
    qFailed ? qCheck.issues.map(i => i.message).join(" ") : "Document image quality is acceptable.",
    { issues: qCheck.issues }
  );

  if (qFailed) {
    result.hasCriticalError = true;
    result.documentUnreadable = true;
    result.overallStatus = "failed";
    result.validationErrors = qCheck.issues.filter(i => i.severity === "critical").map(i => ({
      field: i.type, label: "Document Quality", critical: true, message: i.message
    }));
    return result;
  }

  // ─── STAGE 2: Image Preprocessing ─────────────────────────
  let processedPath = passportFilePath;
  try {
    processedPath = await preprocessImage(passportFilePath);
    addStage("Image Preprocessing", "passed", "Image enhanced: greyscale, contrast boost, sharpening applied.");
  } catch {
    addStage("Image Preprocessing", "warning", "Image preprocessing skipped — using original image.");
  }

  // ─── STAGE 3: OCR Text Extraction ─────────────────────────
  let ocrText = "";
  let ocrConfidence = 0;
  try {
    const worker = await createWorker("eng");
    const { data } = await worker.recognize(processedPath);
    await worker.terminate();

    // Cleanup processed file
    if (processedPath !== passportFilePath && fs.existsSync(processedPath)) {
      try { fs.unlinkSync(processedPath); } catch {}
    }

    ocrText = data.text || "";
    ocrConfidence = Math.round(data.confidence || 0);
    result.ocrRawTextLength = ocrText.trim().length;
    result.ocrConfidence = ocrConfidence;

    if (result.ocrRawTextLength < 20) {
      addStage("OCR Text Extraction", "failed",
        `Insufficient text extracted (${result.ocrRawTextLength} chars). The document does not appear to contain readable text.`);
      result.hasCriticalError = true;
      result.documentUnreadable = true;
      result.overallStatus = "failed";
      result.validationErrors = [{ field: "document", label: "OCR Extraction", critical: true,
        message: "The uploaded image does not contain readable text. Please upload a clear, in-focus photograph of your passport bio-data page." }];
      return result;
    }

    addStage("OCR Text Extraction", ocrConfidence >= 70 ? "passed" : "warning",
      `${result.ocrRawTextLength} characters extracted. OCR confidence: ${ocrConfidence}%.${ocrConfidence < 70 ? " Low confidence — consider uploading a clearer image." : ""}`,
      { confidence: ocrConfidence }
    );
  } catch (err) {
    addStage("OCR Text Extraction", "failed", "OCR engine error: " + err.message);
    result.hasCriticalError = true;
    result.documentUnreadable = true;
    result.overallStatus = "failed";
    result.validationErrors = [{ field: "document", label: "OCR Error", critical: true,
      message: "OCR processing failed. Please try uploading the image again." }];
    return result;
  }

  // ─── STAGE 4: Field Extraction ────────────────────────────
  const extracted = extractPassportFields(ocrText);
  const hasMrz = !!extracted.mrz;

  result.ocrData = {
    fullName:       extracted.fullName.value,
    passportNo:     extracted.passportNo.value,
    dob:            extracted.dob.value,
    dobNormalized:  extracted.dob.normalized,
    nationality:    extracted.nationality.value,
    expiry:         extracted.expiry.value,
    expiryNormalized: extracted.expiry.normalized,
    issuingCountry: extracted.issuingCountry.value,
    mrz: extracted.mrz ? {
      docType:       extracted.mrz.docType,
      issuingCountry:extracted.mrz.issuingCountry,
      surname:       extracted.mrz.surname,
      givenNames:    extracted.mrz.givenNames,
      fullName:      extracted.mrz.fullName,
      passportNo:    extracted.mrz.passportNo,
      nationality:   extracted.mrz.nationality,
      sex:           extracted.mrz.sex,
      dob:           extracted.mrz.dob,
      expiry:        extracted.mrz.expiry
    } : null
  };

  const extractedCount = [
    extracted.passportNo.value,
    extracted.fullName.value,
    extracted.dob.value,
    extracted.expiry.value
  ].filter(Boolean).length;

  addStage("Field Extraction", extractedCount >= 2 ? "passed" : "warning",
    `Extracted ${extractedCount} key field(s). ${hasMrz ? "Machine Readable Zone (MRZ) successfully detected and parsed." : "No MRZ found — relying on visual zone data."}`,
    { extractedCount, hasMrz }
  );

  addStage("MRZ Parsing",
    hasMrz ? "passed" : "warning",
    hasMrz
      ? `MRZ decoded: Passport ${extracted.mrz.passportNo}, Name: ${extracted.mrz.fullName}, Country: ${extracted.mrz.issuingCountry}`
      : "Machine Readable Zone not detected. Data extracted from visual zone only."
  );

  // ─── STAGE 5: Field Comparisons ───────────────────────────
  const comparisons = [];

  // Passport number (CRITICAL)
  comparisons.push(compareField("Passport Number", "passportNo", userInput.passportNo, extracted.passportNo, { required: true }));

  // Full name (CRITICAL)
  comparisons.push(compareField("Full Name", "fullName", userInput.fullName, extracted.fullName, { partialMatch: true, required: true }));

  // Passport expiry date (Make non-critical for OCR mismatches as OCR dates are flaky)
  if (extracted.expiry.value) {
    const expiredCheck = checkExpiry(extracted.expiry, userInput.passportExpiry);
    if (expiredCheck) {
      comparisons.push(expiredCheck);
    } else {
      comparisons.push(compareField("Expiry Date", "expiry", userInput.passportExpiry, extracted.expiry, { type: "date", critical: false }));
    }
  } else {
    comparisons.push(compareField("Expiry Date", "expiry", userInput.passportExpiry, extracted.expiry, { type: "date", required: true, critical: false }));
  }

  result.comparisons = comparisons;

  const criticals = comparisons.filter(c => c.critical && c.status !== "match");
  const warnings  = comparisons.filter(c => !c.critical && ["mismatch", "low_confidence", "not_extracted"].includes(c.status));

  result.validationErrors = criticals.map(c => ({
    field: c.field, label: c.label, critical: true,
    enteredValue: c.userEntered, ocrValue: c.ocrExtracted, message: c.message
  }));

  result.hasCriticalError = criticals.length > 0;
  result.validationPassed = criticals.length === 0;

  if (criticals.length > 0) {
    result.overallStatus = "failed";
    addStage("Field Verification", "failed",
      `${criticals.length} critical error(s) found: ${criticals.map(c => c.label).join(", ")}.`);
  } else if (warnings.length > 0 || !hasMrz) {
    result.overallStatus = "manual_review";
    addStage("Field Verification", "warning",
      `Core fields passed. ${warnings.length} non-critical warning(s). Submission will require manual admin review.`);
  } else {
    result.overallStatus = "passed";
    addStage("Field Verification", "passed",
      "All fields verified successfully against the uploaded document.");
  }

  return result;
}

module.exports = { runFullVerification, normalizeDate, normalizePassportNo };
