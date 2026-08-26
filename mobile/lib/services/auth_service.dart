import 'package:firebase_auth/firebase_auth.dart';

import '../core/login_id.dart';

/// Sign-in for students.
///
/// Accounts are created by an administrator in the web panel — there is
/// deliberately no sign-up path here.
class AuthService {
  AuthService({FirebaseAuth? auth}) : _auth = auth ?? FirebaseAuth.instance;

  final FirebaseAuth _auth;

  Stream<User?> get authStateChanges => _auth.authStateChanges();

  User? get currentUser => _auth.currentUser;

  Future<void> signIn({
    required String loginId,
    required String password,
  }) async {
    final email = resolveAuthEmail(loginId);

    try {
      await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
    } on FirebaseAuthException catch (error) {
      throw AuthFailure(_messageFor(error, loginId));
    }
  }

  Future<void> signOut() => _auth.signOut();

  /// Firebase's raw messages mention email addresses that a roll-number
  /// student has never seen, so every case is rewritten.
  String _messageFor(FirebaseAuthException error, String loginId) {
    switch (error.code) {
      case 'invalid-credential':
      case 'user-not-found':
      case 'wrong-password':
        return 'Wrong login ID or password. Check them and try again.';
      case 'invalid-email':
        return 'That login ID is not valid. Enter your roll number or email.';
      case 'user-disabled':
        return 'This account has been disabled. Contact your administrator.';
      case 'too-many-requests':
        return 'Too many failed attempts. Wait a few minutes, then try again.';
      case 'network-request-failed':
        return 'No internet connection. Check your network and try again.';
      default:
        return error.message ?? 'Could not sign in. Please try again.';
    }
  }
}

class AuthFailure implements Exception {
  const AuthFailure(this.message);
  final String message;

  @override
  String toString() => message;
}
