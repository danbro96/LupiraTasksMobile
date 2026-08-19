import type { StyleProp, ViewStyle } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';

/** A single-select segmented control — the shared pattern behind list-kind, completed-mode, and
 *  display-settings pickers. */
export function SegmentedPicker<T extends string>({
  options,
  selected,
  onSelect,
  getLabel,
  style,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  getLabel?: (value: T) => string;
  style?: StyleProp<ViewStyle>;
}) {
  const label = (v: T) => (getLabel ? getLabel(v) : v);
  return (
    <SegmentedButtons<T>
      value={selected}
      onValueChange={v => {
        if (v !== selected) onSelect(v);
      }}
      buttons={options.map(opt => ({ value: opt, label: label(opt), accessibilityLabel: label(opt) }))}
      style={style}
    />
  );
}
