import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_pdfview/flutter_pdfview.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/book.dart';

class PdfReaderScreen extends StatefulWidget {
  const PdfReaderScreen({super.key, required this.book, required this.file});

  final Book book;
  final File file;

  @override
  State<PdfReaderScreen> createState() => _PdfReaderScreenState();
}

class _PdfReaderScreenState extends State<PdfReaderScreen> {
  PDFViewController? _controller;

  int _currentPage = 0;
  int _totalPages = 0;
  bool _ready = false;
  bool _nightMode = false;
  String? _error;

  /// Where the student left off, so reopening a long book does not start over.
  String get _pageKey => 'book_page_${widget.book.id}';

  Future<int> _lastPage() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getInt(_pageKey) ?? 0;
  }

  Future<void> _rememberPage(int page) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_pageKey, page);
  }

  Future<void> _jumpToPage() async {
    final controller = _controller;
    if (controller == null || _totalPages <= 1) return;

    final target = await showDialog<int>(
      context: context,
      builder: (context) => _JumpToPageDialog(
        currentPage: _currentPage + 1,
        totalPages: _totalPages,
      ),
    );

    if (target != null) {
      await controller.setPage(target - 1);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.book.title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 17),
        ),
        actions: [
          IconButton(
            icon: Icon(
              _nightMode ? Icons.light_mode_outlined : Icons.dark_mode_outlined,
            ),
            tooltip: _nightMode ? 'Day mode' : 'Night mode',
            onPressed: () => setState(() => _nightMode = !_nightMode),
          ),
          if (_totalPages > 1)
            IconButton(
              icon: const Icon(Icons.numbers),
              tooltip: 'Go to page',
              onPressed: _jumpToPage,
            ),
        ],
      ),
      body: _error != null
          ? _ReaderError(message: _error!)
          : Stack(
              children: [
                FutureBuilder<int>(
                  future: _lastPage(),
                  builder: (context, snapshot) {
                    if (!snapshot.hasData) {
                      return const SizedBox.shrink();
                    }
                    return PDFView(
                      filePath: widget.file.path,
                      defaultPage: snapshot.data!,
                      fitPolicy: FitPolicy.WIDTH,
                      nightMode: _nightMode,
                      enableSwipe: true,
                      swipeHorizontal: false,
                      autoSpacing: true,
                      pageFling: true,
                      onViewCreated: (controller) =>
                          setState(() => _controller = controller),
                      onRender: (pages) => setState(() {
                        _totalPages = pages ?? 0;
                        _ready = true;
                      }),
                      onPageChanged: (page, total) {
                        if (page == null) return;
                        setState(() {
                          _currentPage = page;
                          _totalPages = total ?? _totalPages;
                        });
                        _rememberPage(page);
                      },
                      onError: (error) => setState(
                        () => _error =
                            'This PDF could not be opened. It may be damaged '
                            'or password-protected.\n\n$error',
                      ),
                      onPageError: (page, error) => setState(
                        () => _error = 'Page ${(page ?? 0) + 1} '
                            'could not be displayed.\n\n$error',
                      ),
                    );
                  },
                ),
                if (!_ready)
                  const ColoredBox(
                    color: Colors.black12,
                    child: Center(child: CircularProgressIndicator()),
                  ),
              ],
            ),
      bottomNavigationBar: (_ready && _totalPages > 0)
          ? SafeArea(
              child: Container(
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: theme.colorScheme.outlineVariant),
                  ),
                ),
                child: Text(
                  'Page ${_currentPage + 1} of $_totalPages',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            )
          : null,
    );
  }
}

class _JumpToPageDialog extends StatefulWidget {
  const _JumpToPageDialog({
    required this.currentPage,
    required this.totalPages,
  });

  final int currentPage;
  final int totalPages;

  @override
  State<_JumpToPageDialog> createState() => _JumpToPageDialogState();
}

class _JumpToPageDialogState extends State<_JumpToPageDialog> {
  late final TextEditingController _controller =
      TextEditingController(text: '${widget.currentPage}');
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final value = int.tryParse(_controller.text.trim());
    if (value == null || value < 1 || value > widget.totalPages) {
      setState(() => _error = 'Enter a number between 1 and ${widget.totalPages}');
      return;
    }
    Navigator.pop(context, value);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Go to page'),
      content: TextField(
        controller: _controller,
        keyboardType: TextInputType.number,
        autofocus: true,
        onSubmitted: (_) => _submit(),
        decoration: InputDecoration(
          labelText: 'Page number',
          helperText: '1 – ${widget.totalPages}',
          errorText: _error,
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(onPressed: _submit, child: const Text('Go')),
      ],
    );
  }
}

class _ReaderError extends StatelessWidget {
  const _ReaderError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.broken_image_outlined,
              size: 52,
              color: theme.colorScheme.outline,
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
            ),
          ],
        ),
      ),
    );
  }
}
