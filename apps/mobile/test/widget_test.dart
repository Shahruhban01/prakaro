import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prakaro/app/app.dart';

void main() {
  testWidgets('Prakaro app smoke test displays placeholder info', (WidgetTester tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: PrakaroApp(),
      ),
    );

    expect(find.text('Prakaro'), findsOneWidget);
    expect(find.text('Parking discovery, simplified.'), findsOneWidget);
    expect(find.text('MVP development environment ready'), findsOneWidget);
  });
}
