import 'package:cloud_firestore/cloud_firestore.dart';

/// How the app knows which reader to open a file with.
enum BookFormat { pdf, epub, text, unsupported }

class Book {
  const Book({
    required this.id,
    required this.title,
    required this.extract,
    required this.fileId,
    required this.fileName,
    required this.mimeType,
    required this.fileSize,
    required this.downloadUrl,
    required this.createdAt,
  });

  final String id;
  final String title;
  final String extract;
  final String fileId;
  final String fileName;
  final String? mimeType;
  final int? fileSize;
  final String downloadUrl;
  final DateTime? createdAt;

  factory Book.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? const <String, dynamic>{};
    final fileId = (data['fileId'] ?? '') as String;

    return Book(
      id: doc.id,
      title: (data['title'] ?? 'Untitled') as String,
      extract: (data['extract'] ?? '') as String,
      fileId: fileId,
      fileName: (data['fileName'] ?? '') as String,
      mimeType: data['mimeType'] as String?,
      fileSize: (data['fileSize'] as num?)?.toInt(),
      // Older entries may predate the stored URL, so rebuild it if missing.
      downloadUrl: (data['downloadUrl'] as String?) ??
          'https://drive.usercontent.google.com/download'
              '?id=$fileId&export=download&confirm=t',
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
    );
  }

  /// Extension carried over from the original upload, used when caching the
  /// file locally — some readers refuse to open a path without one.
  String get extension {
    final dot = fileName.lastIndexOf('.');
    if (dot > 0 && dot < fileName.length - 1) {
      return fileName.substring(dot).toLowerCase();
    }
    return switch (format) {
      BookFormat.pdf => '.pdf',
      BookFormat.epub => '.epub',
      BookFormat.text => '.txt',
      BookFormat.unsupported => '.bin',
    };
  }

  BookFormat get format {
    // The MIME type recorded by Drive is authoritative; fall back to the file
    // name when Drive reported something generic.
    switch (mimeType) {
      case 'application/pdf':
        return BookFormat.pdf;
      case 'application/epub+zip':
        return BookFormat.epub;
      case 'text/plain':
        return BookFormat.text;
    }

    final lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) return BookFormat.pdf;
    if (lower.endsWith('.epub')) return BookFormat.epub;
    if (lower.endsWith('.txt')) return BookFormat.text;
    return BookFormat.unsupported;
  }

  String get formatLabel {
    final dot = fileName.lastIndexOf('.');
    if (dot > 0 && dot < fileName.length - 1) {
      return fileName.substring(dot + 1).toUpperCase();
    }
    return switch (format) {
      BookFormat.pdf => 'PDF',
      BookFormat.epub => 'EPUB',
      BookFormat.text => 'TXT',
      BookFormat.unsupported => 'FILE',
    };
  }

  String get readableSize {
    final bytes = fileSize;
    if (bytes == null || bytes <= 0) return '';
    if (bytes < 1024) return '$bytes B';

    const units = ['KB', 'MB', 'GB'];
    var size = bytes / 1024;
    var unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }
    return '${size.toStringAsFixed(size >= 10 ? 0 : 1)} ${units[unit]}';
  }
}
