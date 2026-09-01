import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/book.dart';

/// Reads the book catalogue.
///
/// Firestore rules allow signed-in students to read `books` and nothing else,
/// so this is read-only by construction.
///
/// Everything here is paged. An earlier version subscribed to the whole
/// collection, which costs one document read per book on every cold start: at
/// 10,000 titles five students would exhaust the free daily quota between them
/// and everyone after that would see an empty catalogue. Pages of 25 keep a
/// typical session near 100 reads instead.
class LibraryService {
  LibraryService({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  static const int pageSize = 25;

  CollectionReference<Map<String, dynamic>> get _books =>
      _db.collection('books');

  /// Live view of the newest page only.
  ///
  /// A book added in the admin panel still appears without the student
  /// refreshing, but the listener is bounded, so the cost does not grow with
  /// the size of the catalogue.
  Stream<List<Book>> watchFirstPage() {
    return _books
        .orderBy('createdAt', descending: true)
        .limit(pageSize)
        .snapshots()
        .map((snapshot) => snapshot.docs.map(Book.fromDoc).toList());
  }

  /// Fetches the page after [lastDocumentId].
  ///
  /// Uses the document snapshot as the cursor rather than a raw timestamp so
  /// Firestore derives every sort key itself. Bulk imports create many records
  /// within the same millisecond, and a timestamp cursor would skip or repeat
  /// records when they tie.
  Future<BookPage> loadMore(String lastDocumentId) async {
    final cursor = await _books.doc(lastDocumentId).get();
    if (!cursor.exists) return const BookPage(books: [], hasMore: false);

    final snapshot = await _books
        .orderBy('createdAt', descending: true)
        .startAfterDocument(cursor)
        .limit(pageSize + 1)
        .get();

    return _toPage(snapshot.docs);
  }

  /// Prefix search on the title.
  ///
  /// Firestore has no full text search, so this matches titles that *begin*
  /// with [term]. Searching "algorithms" will not find "Introduction to
  /// Algorithms"; the UI says so rather than leaving the student to guess.
  Future<BookPage> search(String term) async {
    final prefix = normaliseSearchTerm(term);
    if (prefix.isEmpty) return const BookPage(books: [], hasMore: false);

    final snapshot = await _books
        .orderBy('titleLower')
        .startAt([prefix])
        //  sorts after any character a title realistically contains,
        // which turns the range query into a "begins with" match.
        .endAt(['$prefix'])
        .limit(pageSize + 1)
        .get();

    return _toPage(snapshot.docs);
  }

  BookPage _toPage(List<QueryDocumentSnapshot<Map<String, dynamic>>> docs) {
    final hasMore = docs.length > pageSize;
    final visible = hasMore ? docs.sublist(0, pageSize) : docs;
    return BookPage(
      books: visible.map(Book.fromDoc).toList(),
      hasMore: hasMore,
    );
  }
}

/// Must match the normalisation the admin API applies when writing
/// `titleLower`, or a search will never match what was stored.
String normaliseSearchTerm(String value) =>
    value.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

class BookPage {
  const BookPage({required this.books, required this.hasMore});

  final List<Book> books;
  final bool hasMore;
}
