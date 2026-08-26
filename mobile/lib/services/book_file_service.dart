import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

import '../models/book.dart';

/// Downloads book files from Drive and keeps them on the device.
///
/// Once cached, a book opens instantly and works offline — which matters for
/// students on patchy or metered connections.
class BookFileService {
  BookFileService({Dio? client}) : _client = client ?? Dio();

  final Dio _client;

  Future<Directory> _booksDirectory() async {
    final base = await getApplicationDocumentsDirectory();
    final dir = Directory('${base.path}/books');
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    return dir;
  }

  Future<File> _fileFor(Book book) async {
    final dir = await _booksDirectory();
    return File('${dir.path}/${book.id}${book.extension}');
  }

  /// The local file if this book has already been downloaded, else null.
  Future<File?> cachedFile(Book book) async {
    final file = await _fileFor(book);
    if (await file.exists() && await file.length() > 0) return file;
    return null;
  }

  Future<bool> isDownloaded(Book book) async =>
      await cachedFile(book) != null;

  /// Downloads the book, reporting progress from 0.0 to 1.0.
  ///
  /// Returns the cached copy immediately if there is one.
  Future<File> download(
    Book book, {
    void Function(double progress)? onProgress,
    CancelToken? cancelToken,
  }) async {
    final existing = await cachedFile(book);
    if (existing != null) return existing;

    final target = await _fileFor(book);
    // Download to a temporary name so an interrupted transfer never leaves a
    // truncated file that later looks like a valid cached book.
    final partial = File('${target.path}.part');

    try {
      await _client.download(
        book.downloadUrl,
        partial.path,
        cancelToken: cancelToken,
        options: Options(
          followRedirects: true,
          receiveTimeout: const Duration(minutes: 10),
        ),
        onReceiveProgress: (received, total) {
          if (total > 0 && onProgress != null) {
            onProgress(received / total);
          }
        },
      );

      await _verify(partial, book);
      await partial.rename(target.path);
      return target;
    } catch (error) {
      if (await partial.exists()) {
        await partial.delete();
      }
      if (error is DioException) {
        throw BookDownloadFailure(_messageFor(error));
      }
      rethrow;
    }
  }

  /// Guards against Drive returning an HTML page instead of the file — its
  /// virus-scan interstitial and "access denied" pages both come back as a
  /// 200, so without this check the app would cache a web page as the book.
  Future<void> _verify(File file, Book book) async {
    if (!await file.exists() || await file.length() == 0) {
      throw const BookDownloadFailure(
        'The download finished but the file was empty. Try again.',
      );
    }

    final head = await file.openRead(0, 512).first;
    final start = String.fromCharCodes(head.take(200)).trimLeft().toLowerCase();

    if (start.startsWith('<!doctype html') || start.startsWith('<html')) {
      throw const BookDownloadFailure(
        'This book could not be downloaded. Ask your administrator to check '
        'that its file is still shared.',
      );
    }

    // A PDF that does not begin with %PDF is not a PDF, and the reader would
    // fail with a far less helpful message.
    if (book.format == BookFormat.pdf && !start.startsWith('%pdf')) {
      throw const BookDownloadFailure(
        'This file is not a readable PDF. Ask your administrator to re-upload it.',
      );
    }
  }

  String _messageFor(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return 'The download timed out. Check your connection and try again.';
      case DioExceptionType.connectionError:
        return 'No internet connection. Check your network and try again.';
      case DioExceptionType.cancel:
        return 'Download cancelled.';
      case DioExceptionType.badResponse:
        final status = error.response?.statusCode;
        if (status == 403 || status == 404) {
          return 'This book is no longer available. Ask your administrator.';
        }
        return 'The download failed (error $status). Try again.';
      default:
        return 'The download failed. Try again.';
    }
  }

  Future<void> delete(Book book) async {
    final file = await _fileFor(book);
    if (await file.exists()) await file.delete();
  }

  /// Total bytes held by downloaded books, for the storage line in Settings.
  Future<int> cacheSize() async {
    final dir = await _booksDirectory();
    var total = 0;
    await for (final entity in dir.list()) {
      if (entity is File) total += await entity.length();
    }
    return total;
  }

  Future<void> clearCache() async {
    final dir = await _booksDirectory();
    if (await dir.exists()) {
      await dir.delete(recursive: true);
    }
  }
}

class BookDownloadFailure implements Exception {
  const BookDownloadFailure(this.message);
  final String message;

  @override
  String toString() => message;
}
