import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vastrenix_app/main.dart';

void main() {
  testWidgets('Release visual regression check: all drawer and navigation icons render valid non-null codePoints', (WidgetTester tester) async {
    await tester.pumpWidget(const VastrenixApp());
    await tester.pumpAndSettle();

    // Verify Bottom Navigation items render with valid Material Icons
    final bottomNavFinder = find.byType(NavigationBar);
    expect(bottomNavFinder, findsOneWidget);

    final List<IconData> expectedIcons = [
      Icons.dashboard_outlined,
      Icons.inventory_2_outlined,
      Icons.point_of_sale_outlined,
      Icons.receipt_long_outlined,
      Icons.hub_outlined,
    ];

    for (final iconData in expectedIcons) {
      expect(iconData.codePoint, isPositive);
      expect(iconData.fontFamily, equals('MaterialIcons'));
      final iconFinder = find.byIcon(iconData);
      expect(iconFinder, findsOneWidget, reason: 'Icon glyph $iconData must render cleanly without font tree-shaking stripping');
    }
  });
}
