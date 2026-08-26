// Firebase configuration for the Digital Library mobile app.
//
// These values are not secrets — they ship inside the APK by design and mirror
// android/app/google-services.json. Access is controlled by Firestore security
// rules, not by hiding these identifiers.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError(
        'The Digital Library app targets Android only. '
        'The admin panel is the web surface.',
      );
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      default:
        throw UnsupportedError(
          'Firebase is not configured for $defaultTargetPlatform. '
          'Register the platform in the Firebase console first.',
        );
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyDr2PSSK8EULOU7B3rioZOWz-3PwO9CU4c',
    appId: '1:695018948722:android:0c629f51225d68b4451aeb',
    messagingSenderId: '695018948722',
    projectId: 'digital-library-ruth-puaf',
    storageBucket: 'digital-library-ruth-puaf.firebasestorage.app',
  );
}
