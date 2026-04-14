import {
  DatePickerField,
  type DatePickerFieldProps,
} from "./DatePickerField";

export type HireDatePickerProps = Omit<
  DatePickerFieldProps,
  "placeholder" | "dialogAriaLabel"
>;

/** Employee hire date: same as {@link DatePickerField} with hire-specific labels. */
export function HireDatePicker(props: HireDatePickerProps) {
  return (
    <DatePickerField
      placeholder="Select hire date"
      dialogAriaLabel="Choose hire date"
      {...props}
    />
  );
}
