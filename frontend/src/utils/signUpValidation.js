export function validateSignUpStep1({
  email,
  dob,
  password,
  confirmPassword,
  firstName,
  lastName,
  address,
  todayDateString,
  isValidEmail,
  validatePassword,
}) {
  const emailValid = isValidEmail(email);
  const dobValid = !!dob && dob <= todayDateString;
  const validation = validatePassword(password);
  const passwordsMatch = password === confirmPassword;

  const canContinue =
    validation.isValid &&
    passwordsMatch &&
    email.trim() &&
    emailValid &&
    firstName.trim() &&
    lastName.trim() &&
    address.trim() &&
    dob.trim() &&
    dobValid;

  return {
    emailValid,
    dobValid,
    validation,
    passwordsMatch,
    canContinue,
    emailError: emailValid ? '' : 'Not a proper email',
    dobError: dobValid ? '' : 'Date of birth cannot be in the future.',
    confirmPasswordError: passwordsMatch ? '' : 'Passwords do not match',
  };
}

export function validateSecurityQuestionsStep(questions, answers) {
  const [q1, q2, q3] = questions;
  const [a1, a2, a3] = answers;

  if (!q1 || !q2 || !q3 || !a1.trim() || !a2.trim() || !a3.trim()) {
    return 'Please select and answer all 3 security questions.';
  }

  if (new Set([q1, q2, q3]).size !== 3) {
    return 'Please select 3 different security questions.';
  }

  return '';
}
