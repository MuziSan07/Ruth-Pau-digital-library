import 'dart:io';

import 'package:flutter/material.dart';

import '../../models/book.dart';

class TextReaderScreen extends StatefulWidget {
  const TextReaderScreen({super.key, required this.book, required this.file});

  final Book book;
  final File file;

  @override
  State<TextReaderScreen> createState() => _TextReaderScreenState();
}

class _TextReaderScreenState extends State<TextReaderScreen> {
  double _fontSize = 16;

  Future<String> _readContents() async {
    try {
      return await widget.file.readAsString();
    } on FileSystemException {
      // Plain-text books are not always UTF-8; fall back to a lenient decode
      // rather than failing outright on one bad byte.
      final bytes = await widget.file.readAsBytes();
      return String.fromCharCodes(bytes);
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
          IconButton(
            icon: const Icon(Icons.text_decrease),
            tooltip: 'Smaller text',
            onPressed: _fontSize <= 12
                ? null
                : () => setState(() => _fontSize -= 2),
          ),
          IconButton(
            icon: const Icon(Icons.text_increase),
            tooltip: 'Larger text',
            onPressed: _fontSize >= 30
                ? null
                : () => setState(() => _fontSize += 2),
          ),
        ],
      ),
      body: FutureBuilder<String>(
        future: _readContents(),
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  'This file could not be read.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }

          return SelectionArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 48),
              child: Text(
                snapshot.data ?? '',
                style: TextStyle(fontSize: _fontSize, height: 1.7),
              ),
            ),
          );
        },
      ),
    );
  }
}
