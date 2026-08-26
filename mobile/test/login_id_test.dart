import 'package:digitallibrary/core/login_id.dart';
import 'package:flutter_test/flutter_test.dart';

// These rules must match admin/api/_lib/ids.js. If they drift, a student
// created in the admin panel cannot sign in on their phone — a failure that is
// slow and confusing to diagnose, so it is pinned down here.
void main() {
  group('resolveAuthEmail', () {
    test('passes a real email through, lowercased', () {
      expect(resolveAuthEmail('Ali.Raza@Gmail.com'), 'ali.raza@gmail.com');
    });

    test('maps a roll number onto the internal domain', () {
      expect(resolveAuthEmail('2024-CS-101'), '2024-cs-101@ruthpuaf.local');
    });

    test('treats spacing and separators as equivalent', () {
      // A student typing it either way must reach the same account.
      expect(
        resolveAuthEmail('2024 / CS / 101'),
        resolveAuthEmail('2024-CS-101'),
      );
    });

    test('trims surrounding whitespace', () {
      expect(resolveAuthEmail('  2024-CS-101  '), '2024-cs-101@ruthpuaf.local');
    });

    test('collapses repeated separators', () {
      expect(resolveAuthEmail('2024--CS__101'), '2024-cs__101@ruthpuaf.local');
    });

    test('rejects an empty login ID', () {
      expect(() => resolveAuthEmail('   '), throwsFormatException);
    });

    test('rejects a roll number with too few usable characters', () {
      expect(() => resolveAuthEmail('#!'), throwsFormatException);
    });
  });

  group('looksLikeEmail', () {
    test('accepts an ordinary address', () {
      expect(looksLikeEmail('student@school.edu'), isTrue);
    });

    test('rejects a roll number', () {
      expect(looksLikeEmail('2024-CS-101'), isFalse);
    });

    test('rejects an address with no domain suffix', () {
      expect(looksLikeEmail('student@school'), isFalse);
    });
  });

  group('slugifyRollNumber', () {
    test('strips leading and trailing separators', () {
      expect(slugifyRollNumber('--2024-CS-101--'), '2024-cs-101');
    });

    test('keeps dots, underscores and hyphens', () {
      expect(slugifyRollNumber('a.b_c-d'), 'a.b_c-d');
    });
  });
}
