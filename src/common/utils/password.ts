export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 8)
    errors.push('Password must be at least 8 characters long');
  if (password.length > 128)
    errors.push('Password must be less than 128 characters');
  if (!/[a-z]/.test(password))
    errors.push('Password must contain at least one lowercase letter');
  if (!/[A-Z]/.test(password))
    errors.push('Password must contain at least one uppercase letter');
  if (!/\d/.test(password))
    errors.push('Password must contain at least one number');
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  const commonPasswords = [
    'password',
    '123456789',
    'qwertyuiop',
    'asdfghjkl',
    'zxcvbnm',
    'admin123',
    'welcome123',
    'password123',
    'qwerty123',
  ];
  if (commonPasswords.some((c) => password.toLowerCase().includes(c))) {
    errors.push('Password contains common patterns and is too weak');
  }
  return { isValid: errors.length === 0, errors };
}
