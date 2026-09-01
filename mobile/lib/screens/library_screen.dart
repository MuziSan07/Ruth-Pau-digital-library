import 'dart:async';

import 'package:flutter/material.dart';

import '../models/book.dart';
import '../services/auth_service.dart';
import '../services/book_file_service.dart';
import '../services/library_service.dart';
import 'book_detail_screen.dart';

class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key, required this.authService});

  final AuthService authService;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  final _libraryService = LibraryService();
  final _fileService = BookFileService();
  final _searchController = TextEditingController();

  /// Live first page. Bounded, so its cost does not grow with the catalogue.
  StreamSubscription<List<Book>>? _subscription;
  List<Book> _livePage = const [];

  /// Pages fetched on demand after the live one.
  final List<Book> _extraPages = [];
  bool _hasMore = false;
  bool _loadingMore = false;

  String _query = '';
  Timer? _debounce;
  bool _searching = false;
  List<Book>? _results; // null means "not searching"

  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _subscribe();
  }

  void _subscribe() {
    _subscription?.cancel();
    _subscription = _libraryService.watchFirstPage().listen(
      (books) {
        if (!mounted) return;
        setState(() {
          // A new book at the top shifts every later page by one, so already
          // loaded pages would overlap. Dropping them is simpler than trying
          // to reconcile, and only happens when the catalogue actually changes.
          final headChanged =
              _livePage.isEmpty || books.isEmpty || books.first.id != _livePage.first.id;
          if (headChanged) _extraPages.clear();

          _livePage = books;
          _hasMore = books.length >= LibraryService.pageSize;
          _loading = false;
          _error = null;
        });
      },
      onError: (Object error) {
        if (!mounted) return;
        setState(() {
          _error = error;
          _loading = false;
        });
      },
    );
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    final combined = [..._livePage, ..._extraPages];
    if (combined.isEmpty) return;

    setState(() => _loadingMore = true);
    try {
      final page = await _libraryService.loadMore(combined.last.id);
      if (!mounted) return;
      setState(() {
        _extraPages.addAll(page.books);
        _hasMore = page.hasMore;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _onQueryChanged(String value) {
    setState(() => _query = value);
    _debounce?.cancel();

    if (value.trim().isEmpty) {
      setState(() {
        _results = null;
        _searching = false;
      });
      return;
    }

    _debounce = Timer(const Duration(milliseconds: 350), _runSearch);
  }

  Future<void> _runSearch() async {
    final term = _query.trim();
    if (term.isEmpty) return;

    setState(() => _searching = true);
    try {
      final page = await _libraryService.search(term);
      if (!mounted) return;
      setState(() {
        _results = page.books;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _subscription?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _confirmSignOut() async {
    final shouldSignOut = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
          'Downloaded books stay on this device and will still be available '
          'when you sign back in.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );

    if (shouldSignOut ?? false) {
      await widget.authService.signOut();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Library'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_outlined),
            tooltip: 'Sign out',
            onPressed: _confirmSignOut,
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: _buildBody(theme),
    );
  }

  Widget _buildBody(ThemeData theme) {
    if (_error != null && _livePage.isEmpty && _results == null) {
      return _ErrorState(
        message: 'Could not load the library.\n'
            'Check your connection and try again.',
        onRetry: _subscribe,
      );
    }

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    final searching = _results != null;
    final visible = searching ? _results! : [..._livePage, ..._extraPages];
    final catalogueEmpty = _livePage.isEmpty && !searching;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: TextField(
            controller: _searchController,
            onChanged: _onQueryChanged,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Search by title…',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _query.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close),
                      tooltip: 'Clear search',
                      onPressed: () {
                        _searchController.clear();
                        _onQueryChanged('');
                      },
                    ),
            ),
          ),
        ),
        if (_searching)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 6),
            child: SizedBox(
              height: 2,
              child: LinearProgressIndicator(),
            ),
          ),
        Expanded(
          child: catalogueEmpty
              ? const _EmptyState(
                  icon: Icons.menu_book_outlined,
                  title: 'No books yet',
                  message: 'Books added by your administrator will appear here.',
                )
              : visible.isEmpty
                  ? const _EmptyState(
                      icon: Icons.search_off_outlined,
                      title: 'No matches',
                      // Search matches the start of a title, so say so rather
                      // than letting the student assume the book is missing.
                      message: 'Search matches the beginning of a title. '
                          'Try the first word.',
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
                      // One extra row for the load more control.
                      itemCount: visible.length + (_showLoadMore(searching) ? 1 : 0),
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        if (index >= visible.length) {
                          return _LoadMoreButton(
                            loading: _loadingMore,
                            onPressed: _loadMore,
                          );
                        }
                        final book = visible[index];
                        return _BookCard(
                          book: book,
                          fileService: _fileService,
                          onOpen: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => BookDetailScreen(
                                book: book,
                                fileService: _fileService,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
        ),
        if (visible.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(
              searching
                  ? '${visible.length} ${visible.length == 1 ? 'match' : 'matches'}'
                  : 'Showing ${visible.length}${_hasMore ? ' of more' : ''}',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
      ],
    );
  }

  bool _showLoadMore(bool searching) => !searching && _hasMore;
}

class _LoadMoreButton extends StatelessWidget {
  const _LoadMoreButton({required this.loading, required this.onPressed});

  final bool loading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: OutlinedButton(
        onPressed: loading ? null : onPressed,
        child: Text(loading ? 'Loading…' : 'Load more books'),
      ),
    );
  }
}

class _BookCard extends StatelessWidget {
  const _BookCard({
    required this.book,
    required this.fileService,
    required this.onOpen,
  });

  final Book book;
  final BookFileService fileService;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 46,
                height: 58,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: Text(
                  book.formatLabel,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: theme.colorScheme.onPrimaryContainer,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      book.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (book.extract.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        book.extract,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                          height: 1.4,
                        ),
                      ),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        if (book.readableSize.isNotEmpty)
                          Text(
                            book.readableSize,
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        const Spacer(),
                        FutureBuilder<bool>(
                          future: fileService.isDownloaded(book),
                          builder: (context, snapshot) {
                            if (snapshot.data != true) {
                              return const SizedBox.shrink();
                            }
                            return Row(
                              children: [
                                Icon(
                                  Icons.offline_pin_outlined,
                                  size: 15,
                                  color: theme.colorScheme.primary,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  'Saved',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    color: theme.colorScheme.primary,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(36),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 54, color: theme.colorScheme.outline),
            const SizedBox(height: 16),
            Text(title, style: theme.textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(36),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.cloud_off_outlined,
              size: 54,
              color: theme.colorScheme.outline,
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 18),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
