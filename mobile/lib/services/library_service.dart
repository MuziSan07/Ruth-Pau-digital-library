import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/book.dart';

/// Reads the book catalogue.
///
/// Firestore rules allow signed-in students to read `books` and nothing else,
/// so this is read-only by construction.
class LibraryService {
  LibraryService({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  /// Live catalogue — a book added in the admin panel appears without the
  /// student needing to refresh.
  Stream<List<Book>> watchBooks() {
    return _db
        .collection('books')
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs.map(Book.fromDoc).toList());
  }
}
