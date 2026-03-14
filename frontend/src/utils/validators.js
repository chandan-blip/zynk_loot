// Phone number validator (ported from MobileNumberValidator PHP class)
const COUNTRY_DATA = {
  IN: { code: '91', lengths: [10], name: 'India', format: '+91 XXXXX XXXXX' },
  US: { code: '1', lengths: [10], name: 'United States', format: '+1 (XXX) XXX-XXXX' },
  CA: { code: '1', lengths: [10], name: 'Canada', format: '+1 (XXX) XXX-XXXX' },
  GB: { code: '44', lengths: [10, 11], name: 'United Kingdom', format: '+44 XXXX XXXXXX' },
  AU: { code: '61', lengths: [9], name: 'Australia', format: '+61 XXX XXX XXX' },
  DE: { code: '49', lengths: [10, 11], name: 'Germany', format: '+49 XXX XXXXXXX' },
  FR: { code: '33', lengths: [9], name: 'France', format: '+33 X XX XX XX XX' },
  JP: { code: '81', lengths: [10, 11], name: 'Japan', format: '+81 XX XXXX XXXX' },
  CN: { code: '86', lengths: [11], name: 'China', format: '+86 XXX XXXX XXXX' },
  BR: { code: '55', lengths: [10, 11], name: 'Brazil', format: '+55 XX XXXXX-XXXX' },
  AE: { code: '971', lengths: [9], name: 'UAE', format: '+971 XX XXX XXXX' },
  SG: { code: '65', lengths: [8], name: 'Singapore', format: '+65 XXXX XXXX' },
};

// Detect country from raw local number pattern (no country code)
// Uses starting digits + length to guess the country
const LOCAL_PATTERNS = [
  // India: 10 digits starting with 6-9
  { match: (d) => d.length === 10 && /^[6-9]/.test(d), iso: 'IN' },
  // China: 11 digits starting with 1
  { match: (d) => d.length === 11 && d.startsWith('1'), iso: 'CN' },
  // US/CA: 10 digits starting with 2-9 (area code)
  { match: (d) => d.length === 10 && /^[2-9]/.test(d), iso: 'US' },
  // UK: 10-11 digits starting with 07
  { match: (d) => (d.length === 10 || d.length === 11) && d.startsWith('07'), iso: 'GB' },
  // Australia: 9 digits starting with 4
  { match: (d) => d.length === 9 && d.startsWith('4'), iso: 'AU' },
  // Germany: 10-11 digits starting with 01
  { match: (d) => (d.length === 10 || d.length === 11) && d.startsWith('01'), iso: 'DE' },
  // France: 9 digits starting with 6 or 7
  { match: (d) => d.length === 9 && /^[67]/.test(d), iso: 'FR' },
  // Japan: 10-11 digits starting with 0
  { match: (d) => (d.length === 10 || d.length === 11) && d.startsWith('0'), iso: 'JP' },
  // Brazil: 10-11 digits starting with any (area codes vary)
  { match: (d) => (d.length === 10 || d.length === 11) && /^[1-9]/.test(d), iso: 'BR' },
  // Singapore: 8 digits starting with 8 or 9
  { match: (d) => d.length === 8 && /^[89]/.test(d), iso: 'SG' },
  // UAE: 9 digits starting with 5
  { match: (d) => d.length === 9 && d.startsWith('5'), iso: 'AE' },
];

// VoIP prefixes to flag
const VOIP_PREFIXES = ['800', '888', '877', '866', '855', '844', '833'];

export function validatePhone(number) {
  if (!number) return { valid: false, error: 'Phone number is required' };

  // Sanitize: remove all non-digits except leading +
  const hasPlus = number.trim().startsWith('+');
  let digits = number.replace(/\D/g, '');

  if (digits.length < 7) return { valid: false, error: 'Phone number is too short' };
  if (digits.length > 15) return { valid: false, error: 'Phone number is too long' };

  // Detect country from dial code (when user typed + or full code)
  let country = null;
  let localNumber = digits;

  if (hasPlus) {
    // Try 3-digit codes first, then 2-digit, then 1-digit
    const sorted = Object.entries(COUNTRY_DATA).sort((a, b) => b[1].code.length - a[1].code.length);
    for (const [code, data] of sorted) {
      if (digits.startsWith(data.code)) {
        const local = digits.slice(data.code.length);
        if (data.lengths.includes(local.length)) {
          country = { ...data, iso: code };
          localNumber = local;
          break;
        }
      }
    }
  }

  // No country code provided — detect from number pattern
  if (!country && !hasPlus) {
    // Strip leading 0 for countries that use trunk prefix (UK, DE, JP, AU)
    const withoutTrunk = digits.startsWith('0') ? digits.slice(1) : digits;

    for (const pattern of LOCAL_PATTERNS) {
      if (pattern.match(digits)) {
        const data = COUNTRY_DATA[pattern.iso];
        // For countries with trunk prefix (0), strip it for the local number
        let local = digits;
        if (['GB', 'DE', 'JP', 'AU'].includes(pattern.iso) && digits.startsWith('0')) {
          local = digits.slice(1);
        }
        if (data.lengths.includes(local.length)) {
          country = { ...data, iso: pattern.iso };
          localNumber = local;
          break;
        }
      }
    }

    // Fallback: also try matching withoutTrunk against country lengths
    if (!country && digits.startsWith('0')) {
      for (const pattern of LOCAL_PATTERNS) {
        if (pattern.match(withoutTrunk)) {
          const data = COUNTRY_DATA[pattern.iso];
          if (data.lengths.includes(withoutTrunk.length)) {
            country = { ...data, iso: pattern.iso };
            localNumber = withoutTrunk;
            break;
          }
        }
      }
    }
  }

  // Also try with country code even without + (e.g. user typed 919876543210)
  if (!country) {
    const sorted = Object.entries(COUNTRY_DATA).sort((a, b) => b[1].code.length - a[1].code.length);
    for (const [code, data] of sorted) {
      if (digits.startsWith(data.code)) {
        const local = digits.slice(data.code.length);
        if (data.lengths.includes(local.length)) {
          country = { ...data, iso: code };
          localNumber = local;
          break;
        }
      }
    }
  }

  if (!country) {
    if (digits.length >= 7 && digits.length <= 15) {
      return { valid: true, phone: `+${digits}`, country: null, formatted: `+${digits}` };
    }
    return { valid: false, error: 'Could not detect country. Try adding +country code' };
  }

  // Validate length against country rules
  if (!country.lengths.includes(localNumber.length)) {
    return {
      valid: false,
      error: `${country.name} numbers must be ${country.lengths.join(' or ')} digits (got ${localNumber.length})`
    };
  }

  // Check for VoIP/toll-free
  const first3 = localNumber.slice(0, 3);
  const isVoip = VOIP_PREFIXES.includes(first3);

  // Format as E.164
  const e164 = `+${country.code}${localNumber}`;

  return {
    valid: true,
    phone: e164,
    country: country.iso,
    countryName: country.name,
    localNumber,
    isVoip,
    formatted: e164,
  };
}

// Email validator
const DISPOSABLE_DOMAINS = [
  'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'dispostable.com', 'trashmail.com', 'temp-mail.org', 'fakeinbox.com',
  'mailnesia.com', 'maildrop.cc', 'discard.email', 'tmpmail.net',
];

export function validateEmail(email) {
  if (!email) return { valid: false, error: 'Email is required' };

  const trimmed = email.trim().toLowerCase();

  // Basic format check
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Must have at least one dot in domain
  const [, domain] = trimmed.split('@');
  if (!domain || !domain.includes('.')) {
    return { valid: false, error: 'Invalid email domain' };
  }

  // TLD must be at least 2 chars
  const tld = domain.split('.').pop();
  if (tld.length < 2) {
    return { valid: false, error: 'Invalid email domain' };
  }

  // Check disposable domains
  if (DISPOSABLE_DOMAINS.includes(domain)) {
    return { valid: false, error: 'Disposable email addresses are not allowed' };
  }

  return { valid: true, email: trimmed };
}
