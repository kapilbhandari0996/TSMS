function normalizeDate(raw) {
  if (!raw) return null;
  let s = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  s = s.replace(/\s*([\/\-\.])\s*/g, '$1');

  let m = s.match(/^(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})$/);
  if (m) {
    const da = parseInt(m[1]);
    const mo = parseInt(m[2]);
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    }
  }
  return 'FALLBACK';
}

console.log(normalizeDate('19 / 06 / 2033'));
