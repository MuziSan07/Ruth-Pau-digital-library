import 'dart:io';

import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';

import '../models/book.dart';
import '../services/book_file_service.dart';
import 'readers/epub_reader_screen.dart';
import 'readers/pdf_reader_screen.dart';
import 'readers/text_reader_screen.dart';

class BookDetailScreen extends StatefulWidget {
  const BookDetailScreen({
    super.key,
    required this.book,
    required this.fileService,
  });

  final Book book;
  final BookFileService fileService;

  @override
  State<BookDetailScreen> createState() => _BookDetailScreenState();
}

class _BookDetailScreenState extends State<BookDetailScreen> {
  double? _progress;
  bool _downloaded = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _refreshDownloadState();
  }

  Future<void> _refreshDownloadState() async {
    final downloaded = await widget.fileService.isDownloaded(widget.book);
    if (mounted) setState(() => _downloaded = downloaded);
  }

  Future<void> _read() async {
    setState(() => _error = null);

    File file;
    try {
      final cached = await widget.fileService.cachedFile(widget.book);
      if (cached != null) {
        file = cached;
      } else {
        setState(() => _progress = 0);
        file = await widget.fileService.download(
          widget.book,
          onProgress: (value) {
            if (mounted) setState(() => _progress = value);
          },
        );
      }
    } on BookDownloadFailure catch (failure) {
      if (mounted) {
        setState(() {
          _error = failure.message;
          _progress = null;
        });
      }
      return;
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Could not open this book. Please try again.';
          _progress = null;
        });
      }
      return;
    }

    if (!mounted) return;
    setState(() {
      _progress = null;
      _downloaded = true;
    });

    await _openReader(file);
  }

  Future<void> _openReader(File file) async {
    final book = widget.book;

    switch (book.format) {
      case BookFormat.pdf:
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => PdfReaderScreen(book: book, file: file),
          ),
        );
      case BookFormat.epub:
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => EpubReaderScreen(book: book, file: file),
          ),
        );
      case BookFormat.text:
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => TextReaderScreen(book: book, file: file),
          ),
        );
      case BookFormat.unsupported:
        // Formats without a built-in reader (DOC, MOBI, AZW3) are handed to
        // whichever app on the device can open them.
        final result = await OpenFilex.open(file.path);
        if (result.type != ResultType.done && mounted) {
          setState(() {
            _error = 'No app on this device can open ${book.formatLabel} files. '
                'Install a reader for it, or ask your administrator for a PDF.';
          });
        }
    }
  }

  Future<void> _removeDownload() async {
    await widget.fileService.delete(widget.book);
    if (!mounted) return;
    setState(() => _downloaded = false);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Download removed from this device.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final book = widget.book;
    final downloading = _progress != null;

    return Scaffold(
      appBar: AppBar(title: const Text('Book')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 62,
                height: 78,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(10),
                ),
                alignment: Alignment.center,
                child: Text(
                  book.formatLabel,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: theme.colorScheme.onPrimaryContainer,
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      book.title,
                      style: theme.textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        _Chip(label: book.formatLabel),
                        if (book.readableSize.isNotEmpty)
                          _Chip(label: book.readableSize),
                        if (_downloaded)
                          _Chip(
                            label: 'Saved offline',
                            icon: Icons.offline_pin_outlined,
                            highlight: true,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),

          if (_error != null) ...[
            const SizedBox(height: 22),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: theme.colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.error_outline,
                    size: 20,
                    color: theme.colorScheme.onErrorContainer,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _error!,
                      style: TextStyle(
                        color: theme.colorScheme.onErrorContainer,
                        fontSize: 13.5,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 26),

          FilledButton.icon(
            onPressed: downloading ? null : _read,
            icon: Icon(
              _downloaded ? Icons.menu_book_outlined : Icons.download_outlined,
            ),
            label: Text(
              downloading
                  ? 'Downloading… ${((_progress ?? 0) * 100).round()}%'
                  : _downloaded
                      ? 'Read now'
                      : 'Download and read',
            ),
          ),

          if (downloading) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: (_progress ?? 0) > 0 ? _progress : null,
                minHeight: 6,
              ),
            ),
          ],

          if (_downloaded && !downloading) ...[
            const SizedBox(height: 10),
            TextButton.icon(
              onPressed: _removeDownload,
              icon: const Icon(Icons.delete_outline, size: 20),
              label: const Text('Remove download'),
            ),
          ],

          if (book.extract.isNotEmpty) ...[
            const SizedBox(height: 30),
            Text(
              'Extract',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
                letterSpacing: 0.3,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              book.extract,
              style: theme.textTheme.bodyMedium?.copyWith(height: 1.65),
            ),
          ],
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.icon, this.highlight = false});

  final String label;
  final IconData? icon;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = highlight
        ? theme.colorScheme.primary
        : theme.colorScheme.onSurfaceVariant;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 5),
          ],
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
