import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design/components/prakaro_button.dart';
import '../../../../core/design/components/prakaro_sheet.dart';
import '../../../../core/design/prakaro_icons.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/parking_location.dart';
import '../parking_providers.dart';

class ReportCategoryOption {
  const ReportCategoryOption({
    required this.id,
    required this.label,
    required this.description,
    required this.icon,
  });

  final String id;
  final String label;
  final String description;
  final IconData icon;
}

const List<ReportCategoryOption> kReportCategories = [
  ReportCategoryOption(
    id: 'NOT_PARKING',
    label: 'Not a parking lot',
    description: 'This is a private house, store, or not a parking area',
    icon: Icons.block_rounded,
  ),
  ReportCategoryOption(
    id: 'PRIVATE',
    label: 'Private or restricted access',
    description: 'Only accessible to specific tenants, employees, or customers',
    icon: Icons.lock_outline_rounded,
  ),
  ReportCategoryOption(
    id: 'WRONG_LOCATION',
    label: 'Incorrect pin or location',
    description: 'The map marker or address does not match real entrance',
    icon: Icons.wrong_location_outlined,
  ),
  ReportCategoryOption(
    id: 'PRICE',
    label: 'Wrong pricing info',
    description: 'Rates, fees, or free status are inaccurate',
    icon: Icons.attach_money_rounded,
  ),
  ReportCategoryOption(
    id: 'HOURS',
    label: 'Incorrect hours',
    description: 'Open or closed status does not match posted schedule',
    icon: Icons.access_time_rounded,
  ),
  ReportCategoryOption(
    id: 'CLOSED',
    label: 'Permanently closed',
    description: 'Demolished, blocked, or permanently shut down',
    icon: Icons.do_not_disturb_on_outlined,
  ),
  ReportCategoryOption(
    id: 'OTHER',
    label: 'Other problem',
    description: 'Safety issues, incorrect amenities, or other details',
    icon: Icons.more_horiz_rounded,
  ),
];

class ReportParkingBottomSheet extends ConsumerStatefulWidget {
  const ReportParkingBottomSheet({
    super.key,
    required this.facility,
  });

  final ParkingLocation facility;

  static Future<bool?> show(
    BuildContext context, {
    required ParkingLocation facility,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => ReportParkingBottomSheet(facility: facility),
    );
  }

  @override
  ConsumerState<ReportParkingBottomSheet> createState() =>
      _ReportParkingBottomSheetState();
}

class _ReportParkingBottomSheetState
    extends ConsumerState<ReportParkingBottomSheet> {
  String? _selectedCategory;
  final TextEditingController _notesController = TextEditingController();
  bool _isSubmitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submitReport() async {
    if (_selectedCategory == null) {
      setState(() {
        _errorMessage = 'Please select a reason for this report.';
      });
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    try {
      final reportFn = ref.read(reportParkingProvider);
      final success = await reportFn(
        placeId: widget.facility.id,
        category: _selectedCategory!,
        notes: _notesController.text.trim().isNotEmpty
            ? _notesController.text.trim()
            : null,
      );

      if (!mounted) return;

      if (success) {
        Navigator.of(context).pop(true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Thank you! Your report has been submitted to moderation for review.',
            ),
            backgroundColor: Color(0xFF059669),
            duration: Duration(seconds: 4),
          ),
        );
      } else {
        setState(() {
          _isSubmitting = false;
          _errorMessage =
              'Could not submit report right now. Please try again later.';
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        _errorMessage = 'An error occurred while submitting your report.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final maxHeight = MediaQuery.sizeOf(context).height * 0.88;

    final displayName = widget.facility.name.trim().isEmpty
        ? 'Parking Facility'
        : widget.facility.name.trim();

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: PrakaroSheet(
          showDragHandle: true,
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: isDark
                          ? const Color(0xFF3B1D1D)
                          : const Color(0xFFFEF2F2),
                      borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                      border: Border.all(
                        color: isDark
                            ? const Color(0xFF991B1B)
                            : const Color(0xFFFECACA),
                      ),
                    ),
                    child: Icon(
                      Icons.flag_rounded,
                      size: 20,
                      color: isDark
                          ? const Color(0xFFF87171)
                          : const Color(0xFFDC2626),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Report Parking Issue',
                          style: TextStyle(
                            fontSize: 18.0,
                            fontWeight: FontWeight.w700,
                            color: isDark
                                ? AppTheme.textPrimaryDark
                                : AppTheme.textPrimaryLight,
                            letterSpacing: -0.3,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13.0,
                            color: isDark
                                ? AppTheme.textSecondaryDark
                                : AppTheme.textSecondaryLight,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, size: 20),
                    onPressed: () => Navigator.of(context).pop(false),
                    tooltip: 'Close',
                  ),
                ],
              ),

              const SizedBox(height: 16),

              Flexible(
                child: SingleChildScrollView(
                  physics: const ClampingScrollPhysics(),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'What issue did you encounter with this facility?',
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          color: isDark
                              ? AppTheme.textPrimaryDark
                              : AppTheme.textPrimaryLight,
                        ),
                      ),
                      const SizedBox(height: 10),

                      // Category choices
                      ...kReportCategories.map((cat) {
                        final isSelected = _selectedCategory == cat.id;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8.0),
                          child: InkWell(
                            onTap: () {
                              AppHaptics.lightImpact();
                              setState(() {
                                _selectedCategory = cat.id;
                                _errorMessage = null;
                              });
                            },
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusSmall),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 10,
                              ),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? (isDark
                                        ? const Color(0xFF1E293B)
                                        : const Color(0xFFEFF6FF))
                                    : (isDark
                                        ? const Color(0xFF161920)
                                        : const Color(0xFFF8F9FA)),
                                borderRadius:
                                    BorderRadius.circular(AppTheme.radiusSmall),
                                border: Border.all(
                                  color: isSelected
                                      ? AppTheme.primaryBlue
                                      : (isDark
                                          ? AppTheme.borderDark
                                          : AppTheme.borderLight),
                                  width: isSelected ? 1.5 : 1.0,
                                ),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    cat.icon,
                                    size: 18,
                                    color: isSelected
                                        ? AppTheme.primaryBlue
                                        : (isDark
                                            ? AppTheme.textSecondaryDark
                                            : AppTheme.textSecondaryLight),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          cat.label,
                                          style: TextStyle(
                                            fontSize: 13.5,
                                            fontWeight: isSelected
                                                ? FontWeight.w700
                                                : FontWeight.w500,
                                            color: isSelected
                                                ? AppTheme.primaryBlue
                                                : (isDark
                                                    ? AppTheme.textPrimaryDark
                                                    : AppTheme
                                                        .textPrimaryLight),
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          cat.description,
                                          style: TextStyle(
                                            fontSize: 11.5,
                                            color: isDark
                                                ? AppTheme.textTertiaryDark
                                                : AppTheme.textTertiaryLight,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  if (isSelected)
                                    const Icon(
                                      Icons.check_circle_rounded,
                                      size: 18,
                                      color: AppTheme.primaryBlue,
                                    ),
                                ],
                              ),
                            ),
                          ),
                        );
                      }),

                      const SizedBox(height: 12),

                      // Optional Notes
                      Text(
                        'Additional details (optional)',
                        style: TextStyle(
                          fontSize: 13.0,
                          fontWeight: FontWeight.w600,
                          color: isDark
                              ? AppTheme.textPrimaryDark
                              : AppTheme.textPrimaryLight,
                        ),
                      ),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _notesController,
                        maxLines: 3,
                        maxLength: 500,
                        style: TextStyle(
                          fontSize: 13.0,
                          color: isDark
                              ? AppTheme.textPrimaryDark
                              : AppTheme.textPrimaryLight,
                        ),
                        decoration: InputDecoration(
                          hintText:
                              'Describe what you saw (e.g. gates locked, new rates, no parking signs)...',
                          hintStyle: TextStyle(
                            fontSize: 12.5,
                            color: isDark
                                ? AppTheme.textTertiaryDark
                                : AppTheme.textTertiaryLight,
                          ),
                          filled: true,
                          fillColor: isDark
                              ? const Color(0xFF161920)
                              : const Color(0xFFF8F9FA),
                          contentPadding: const EdgeInsets.all(12),
                          border: OutlineInputBorder(
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusSmall),
                            borderSide: BorderSide(
                              color: isDark
                                  ? AppTheme.borderDark
                                  : AppTheme.borderLight,
                            ),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusSmall),
                            borderSide: BorderSide(
                              color: isDark
                                  ? AppTheme.borderDark
                                  : AppTheme.borderLight,
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusSmall),
                            borderSide: const BorderSide(
                              color: AppTheme.primaryBlue,
                              width: 1.5,
                            ),
                          ),
                        ),
                      ),

                      if (_errorMessage != null) ...[
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: isDark
                                ? const Color(0xFF3B1D1D)
                                : const Color(0xFFFEF2F2),
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusSmall),
                            border: Border.all(
                              color: isDark
                                  ? const Color(0xFF991B1B)
                                  : const Color(0xFFFECACA),
                            ),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                Icons.error_outline_rounded,
                                size: 16,
                                color: isDark
                                    ? const Color(0xFFF87171)
                                    : const Color(0xFFDC2626),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _errorMessage!,
                                  style: TextStyle(
                                    fontSize: 12.0,
                                    color: isDark
                                        ? const Color(0xFFF87171)
                                        : const Color(0xFFB91C1C),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],

                      const SizedBox(height: 16),
                    ],
                  ),
                ),
              ),

              // Action Buttons
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _isSubmitting
                          ? null
                          : () => Navigator.of(context).pop(false),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(AppTheme.radiusSmall),
                        ),
                        side: BorderSide(
                          color: isDark
                              ? AppTheme.borderDark
                              : AppTheme.borderLight,
                        ),
                      ),
                      child: Text(
                        'Cancel',
                        style: TextStyle(
                          color: isDark
                              ? AppTheme.textSecondaryDark
                              : AppTheme.textSecondaryLight,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: PrakaroButton.primary(
                      label: _isSubmitting ? 'Submitting...' : 'Submit Report',
                      icon: _isSubmitting
                          ? null
                          : PrakaroIconData.shield,
                      isLoading: _isSubmitting,
                      onPressed: _isSubmitting ? null : _submitReport,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
