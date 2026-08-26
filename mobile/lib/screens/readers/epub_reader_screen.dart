import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_epub_viewer/flutter_epub_viewer.dart';

import '../../models/book.dart';

class EpubReaderScreen extends StatefulWidget {
  const EpubReaderScreen({super.key, required this.book, required this.file});

  final Book book;
  final File file;

  @override
  State<EpubReaderScreen> createState() => _EpubReaderScreenState();
}

class _EpubReaderScreenState extends State<EpubReaderScreen> {
  final _controller = EpubController();

  List<EpubChapter> _chapters = const [];
  bool _loaded = false;

  // EpubSource.fromFile takes the package's own conditionally-exported File
  // type, which does not unify with dart:io's. Reading the bytes ourselves and
  // using fromData sidesteps that and behaves identically.
  late final Future<Uint8List> _bytes = widget.file.readAsBytes();

  Future<void> _showChapters() async {
    if (_chapters.isEmpty) return;

    final chapter = await showModalBottomSheet<EpubChapter>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        builder: (context, scrollController) => ListView.builder(
          controller: scrollController,
          itemCount: _chapters.length + 1,
          itemBuilder: (context, index) {
            if (index == 0) {
              return Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                child: Text(
                  'Contents',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
              );
            }
            final chapter = _chapters[index - 1];
            return ListTile(
              title: Text(chapter.title.trim()),
              onTap: () => Navigator.pop(context, chapter),
            );
          },
        ),
      ),
    );

    if (chapter != null) {
      _controller.display(cfi: chapter.href);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.book.title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 17),
        ),
        actions: [
          if (_chapters.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.list_outlined),
              tooltip: 'Contents',
              onPressed: _showChapters,
            ),
        ],
      ),
      body: FutureBuilder<Uint8List>(
        future: _bytes,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  'This EPUB could not be read. It may be damaged — ask your '
                  'administrator to re-upload it.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          return Stack(
            children: [
              EpubViewer(
                epubController: _controller,
                epubSource: EpubSource.fromData(snapshot.data!),
                displaySettings: EpubDisplaySettings(
                  flow: EpubFlow.paginated,
                  snap: true,
                  theme: EpubTheme.light(),
                ),
                onEpubLoaded: () {
                  if (mounted) setState(() => _loaded = true);
                },
                onChaptersLoaded: (chapters) {
                  if (mounted) setState(() => _chapters = chapters);
                },
              ),
              if (!_loaded)
                ColoredBox(
                  color: Theme.of(context).colorScheme.surface,
                  child: const Center(child: CircularProgressIndicator()),
                ),
            ],
          );
        },
      ),
    );
  }
}
