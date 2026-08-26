/// Turns whatever a student types into the email Firebase Auth expects.
///
/// This mirrors admin/api/_lib/ids.js exactly. If the two ever drift, a student
/// created in the panel will not be able to sign in on their phone, so keep any
/// change to one in step with the other.
library;

const String internalDomain = 'ruthpuaf.local';

final RegExp _emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

bool looksLikeEmail(String value) => _emailPattern.hasMatch(value.trim());

/// Keeps letters, digits, dot, underscore and hyphen; collapses anything else
/// into a single hyphen, so "2024 / CS / 101" and "2024-CS-101" both resolve to
/// the same account.
String slugifyRollNumber(String rollNumber) {
  return rollNumber
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9._-]+'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '')
      .replaceAll(RegExp(r'-{2,}'), '-');
}

/// Resolves a typed login ID to the address stored in Firebase Auth.
/// Throws [FormatException] with a message meant for the student.
String resolveAuthEmail(String rawLoginId) {
  final loginId = rawLoginId.trim();

  if (loginId.isEmpty) {
    throw const FormatException('Enter your roll number or email.');
  }

  if (looksLikeEmail(loginId)) {
    return loginId.toLowerCase();
  }

  final slug = slugifyRollNumber(loginId);
  if (slug.length < 3) {
    throw const FormatException(
      'That roll number looks too short. Check it and try again.',
    );
  }

  return '$slug@$internalDomain';
}
