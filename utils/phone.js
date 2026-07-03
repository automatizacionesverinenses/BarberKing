const { parsePhoneNumberFromString } = require('libphonenumber-js');

/**
 * Validates and formats a phone number using libphonenumber-js.
 * Defaults to Spain ('ES') if no country prefix is provided.
 * @param {string} phoneStr 
 * @returns {{isValid: boolean, formatted: string}}
 */
function validateAndFormatPhone(phoneStr) {
  if (!phoneStr) return { isValid: false, formatted: '' };
  
  const cleanPhone = phoneStr.trim();
  const defaultCountry = cleanPhone.startsWith('+') ? undefined : 'ES';
  const phoneNumber = parsePhoneNumberFromString(cleanPhone, defaultCountry);
  
  if (!phoneNumber || !phoneNumber.isValid()) {
    return { isValid: false, formatted: cleanPhone };
  }
  
  return {
    isValid: true,
    formatted: phoneNumber.formatInternational() // e.g. "+34 600 000 000"
  };
}

module.exports = { validateAndFormatPhone };
